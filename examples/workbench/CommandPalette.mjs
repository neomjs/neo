import ClassSystemUtil    from '../../src/util/ClassSystem.mjs';
import CommandActionModel from './CommandActionModel.mjs';
import Component          from '../../src/component/Base.mjs';
import Store              from '../../src/data/Store.mjs';

const PREVENT_INPUT_KEYS = ['ArrowDown', 'ArrowUp', 'End', 'Enter', 'Escape', 'Home', 'Tab'],
      PREVENT_CLOSE_KEYS = ['Escape', 'Tab'];

/**
 * @summary Reusable keyboard-first command palette prototype consumed by Workstation and Web Desktop.
 *
 * `CommandPalette` keeps contextual action discovery decoupled from any single application's state
 * provider or window topology. Consumers supply action descriptors (`id`, `label`, `group`,
 * `description`, `keywords`, `shortcut`, `iconCls`, `available`, `unavailableReason`, `managesFocus`,
 * `handler`) statically via {@link #actions} or dynamically on each open via {@link #actionProvider},
 * backed by a `Neo.data.Store` of {@link Neo.examples.workbench.CommandActionModel} records.
 *
 * ### Accessibility & Interaction Contract
 * - Opens as a modal `role="dialog"` (`aria-modal="true"`) containing an ARIA 1.2 `role="combobox"`
 *   search input controlling a `role="listbox"` (`aria-activedescendant`) of `role="option"` items.
 * - Announces live result counts and unavailable-action explanations through a polite `role="status"`
 *   region (`aria-live="polite"`).
 * - Unavailable commands remain visible (`aria-disabled="true"`) with their explicit reason so users
 *   understand why an action cannot run right now, and are never silently invoked on `Enter` or click.
 * - Restores focus to `returnFocusId` on dismissal, or probes `fallbackFocusId` when an executed
 *   command unmounts the origin control (such as switching arrangements or signing out).
 *
 * @class Neo.examples.workbench.CommandPalette
 * @extends Neo.component.Base
 */
class CommandPalette extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.workbench.CommandPalette'
         * @protected
         */
        className: 'Neo.examples.workbench.CommandPalette',
        /**
         * @member {String} ntype='workbench-command-palette'
         * @protected
         */
        ntype: 'workbench-command-palette',
        /**
         * Pull callback invoked on {@link #open} and {@link #refreshActions}:
         * `({context, palette, windowId}) => Object[]`.
         * @member {Function|null} actionProvider=null
         */
        actionProvider: null,
        /**
         * Static or initial action descriptors loaded when no {@link #actionProvider} is supplied.
         * @member {Object[]} actions_=[]
         * @reactive
         */
        actions_: [],
        /**
         * @member {Boolean} autoInitVnode=false
         */
        autoInitVnode: false,
        /**
         * @member {Boolean} autoMount=false
         */
        autoMount: false,
        /**
         * @member {String[]} baseCls=['neo-command-palette-backdrop']
         * @protected
         */
        baseCls: ['neo-command-palette-backdrop'],
        /**
         * Visible label on the header close control.
         * @member {String} closeButtonText='Esc'
         */
        closeButtonText: 'Esc',
        /**
         * Supporting copy when the consumer registered zero commands.
         * @member {String} emptyActionsDescription='This view has not registered any contextual commands yet.'
         */
        emptyActionsDescription: 'This view has not registered any contextual commands yet.',
        /**
         * Heading shown when the consumer registered zero commands.
         * @member {String} emptyActionsTitle='No commands available'
         */
        emptyActionsTitle: 'No commands available',
        /**
         * Supporting copy when a search query matches zero commands.
         * @member {String} emptyResultsDescription='Try a different action name, group, or keyword.'
         */
        emptyResultsDescription: 'Try a different action name, group, or keyword.',
        /**
         * Heading shown when a search query matches zero commands.
         * @member {String} emptyResultsTitle='No matching commands'
         */
        emptyResultsTitle: 'No matching commands',
        /**
         * Full-viewport fixed modal backdrop (`parentId: 'document.body'`); does not use `.neo-floating`'s
         * off-screen `(-10000px, -10000px)` pre-alignment park.
         * @member {Boolean} floating=false
         */
        floating: false,
        /**
         * The palette focuses its combobox input explicitly after mounting and registering key rules.
         * @member {Boolean} focusOnMount=false
         */
        focusOnMount: false,
        /**
         * @member {Boolean} hidden=true
         */
        hidden: true,
        /**
         * Keyboard hint legend displayed in the palette footer on wide viewports.
         * @member {String} legendText='↑↓ navigate · Enter run · Esc close'
         */
        legendText: '↑↓ navigate · Enter run · Esc close',
        /**
         * @member {String} parentId='document.body'
         */
        parentId: 'document.body',
        /**
         * Placeholder text for the combobox search input.
         * @member {String} placeholder='Type a command or search actions...'
         */
        placeholder: 'Type a command or search actions...',
        /**
         * Backing store of {@link Neo.examples.workbench.CommandActionModel} records.
         * @member {Neo.data.Store|Object|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Accessible dialog title and subtle header badge.
         * @member {String} title='Command Palette'
         */
        title: 'Command Palette',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: []
        }
    }

    /**
     * Arbitrary consumer context passed to {@link #open} and forwarded to {@link #actionProvider} / handlers.
     * @member {*} activeContext=null
     */
    activeContext = null
    /**
     * Zero-based index of the highlighted record in {@link #store}, or `-1` when empty.
     * @member {Number} activeIndex=-1
     */
    activeIndex = -1
    /**
     * Fallback DOM element id (or resolver `() => String|null`) focused when `returnFocusId` is unmounted.
     * @member {Function|String|null} fallbackFocusId=null
     */
    fallbackFocusId = null
    /**
     * Current filter query text in the combobox input.
     * @member {String} query=''
     */
    query = ''
    /**
     * Window id on whose `Neo.main.DomEvents` prevent-default keys are currently registered.
     * @member {Number|String|null} registeredKeyWindowId=null
     * @protected
     */
    registeredKeyWindowId = null
    /**
     * Origin DOM element id captured before opening so dismissal restores keyboard focus.
     * @member {String|null} returnFocusId=null
     */
    returnFocusId = null
    /**
     * Live polite status text announced by the footer `role="status"` node.
     * @member {String} statusText=''
     */
    statusText = ''
    /**
     * Unfiltered count of actions supplied on the latest {@link #refreshActions} pass.
     * @member {Number} totalActionCount=0
     */
    totalActionCount = 0

    /**
     * @summary Checks whether a serialized Neo keyboard event matches the standard palette open chord
     * (`Ctrl+K`, `Meta+K`, or `F1`).
     * @param {Object} data
     * @returns {Boolean}
     */
    static isOpenShortcut(data) {
        if (!data || data.altKey || data.shiftKey) {
            return false
        }

        const key = data.key;

        if ((data.ctrlKey || data.metaKey) && typeof key === 'string' && key.toLowerCase() === 'k') {
            return true
        }

        return !data.ctrlKey && !data.metaKey && key === 'F1'
    }

    /**
     * @summary Matches every whitespace-delimited query token case-insensitively against an action
     * record's label, group, description, shortcut, keywords, and unavailable reason.
     * @param {Neo.examples.workbench.CommandActionModel|Object} record
     * @param {String} query
     * @returns {Boolean}
     */
    static matchesQuery(record, query) {
        const needle = String(query ?? '').trim().toLowerCase();

        if (!needle) {
            return true
        }

        const keywords = Array.isArray(record?.keywords) ? record.keywords.join(' ') : String(record?.keywords ?? ''),
              haystack = [
                  record?.label,
                  record?.group,
                  record?.description,
                  record?.shortcut,
                  record?.unavailableReason,
                  keywords
              ].filter(Boolean).join(' ').toLowerCase(),
              tokens   = needle.split(/\s+/).filter(Boolean);

        return tokens.every(token => haystack.includes(token))
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.addDomListeners([
            {click: me.onBackdropClick, scope: me},
            {click: me.onCloseButtonClick, delegate: '.neo-command-palette-close', scope: me},
            {click: me.onOptionClick, delegate: '.neo-command-palette-option', scope: me},
            {input: me.onInputValueChange, delegate: '.neo-command-palette-input', scope: me},
            {keydown: me.onPaletteKeyDown, scope: me}
        ]);

        if (me.actions?.length > 0 && me.totalActionCount === 0) {
            me.refreshActions({preserveQuery: false, render: false})
        } else {
            me.syncVdom(false)
        }
    }

    /**
     * @returns {String}
     */
    get closeButtonId() {
        return `${this.id}__close`
    }

    /**
     * @returns {String}
     */
    get inputId() {
        return `${this.id}__input`
    }

    /**
     * @returns {Boolean}
     */
    get isOpen() {
        return !this.hidden && (this.mounted || Boolean(Neo.config.unitTestMode))
    }

    /**
     * @returns {String}
     */
    get listboxId() {
        return `${this.id}__listbox`
    }

    /**
     * @returns {String}
     */
    get statusId() {
        return `${this.id}__status`
    }

    /**
     * @returns {String}
     */
    get surfaceId() {
        return `${this.id}__surface`
    }

    /**
     * @returns {String}
     */
    get titleId() {
        return `${this.id}__title`
    }

    /**
     * @summary Executes an available command or announces why an unavailable command was refused.
     * @param {Neo.examples.workbench.CommandActionModel|null} record
     * @param {Object} [meta={}]
     * @param {Object} [meta.event=null]
     * @param {String} [meta.source='keyboard'] `'keyboard'` | `'pointer'` | `'programmatic'`
     * @returns {Promise<{executed: Boolean, reason: String|null, record: Object|null, result: *}>}
     */
    async activateRecord(record, {event = null, source = 'keyboard'} = {}) {
        const me = this;

        if (!record) {
            return {executed: false, reason: 'no-selection', record: null, result: undefined}
        }

        if (!record.available) {
            const reason = record.unavailableReason || 'Unavailable in the current state';

            me.statusText = `${record.label} is unavailable: ${reason}.`;
            me.syncVdom(true);
            me.fire('unavailableAction', {
                context : me.activeContext,
                event,
                palette : me,
                reason,
                record,
                source,
                windowId: me.windowId
            });

            return {executed: false, reason, record, result: undefined}
        }

        const context         = me.activeContext,
              fallbackFocusId = me.fallbackFocusId,
              managesFocus    = Boolean(record.managesFocus),
              returnFocusId   = me.returnFocusId,
              windowId        = me.windowId;

        await me.close({restoreFocus: false});

        let result;

        if (Neo.isFunction(record.handler)) {
            result = await record.handler({
                context,
                event,
                palette: me,
                record,
                source,
                windowId
            })
        }

        me.fire('action', {
            context,
            event,
            palette: me,
            record,
            result,
            source,
            windowId
        });

        if (!managesFocus) {
            await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId)
        }

        return {executed: true, reason: null, record, result}
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetActions(value, oldValue) {
        if (oldValue !== undefined && !this.actionProvider && this.store) {
            this.refreshActions({preserveQuery: this.isOpen, render: this.isOpen})
        }
    }

    /**
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy?.();

        return ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: true,
            filters        : [{
                filterBy: ({item, value: filterValue}) => !CommandPalette.matchesQuery(item, filterValue),
                property: 'query',
                value   : ''
            }],
            keyProperty: 'id',
            model      : CommandActionModel,
            sorters    : [{
                direction: 'DESC',
                property : 'available'
            }]
        })
    }

    /**
     * @summary Builds one `<li role="option">` VDOM descriptor for a `CommandActionModel` record.
     * @param {Neo.examples.workbench.CommandActionModel} record
     * @param {Number} index
     * @returns {Object}
     * @protected
     */
    buildOptionVdom(record, index) {
        const me          = this,
              isActive    = index === me.activeIndex,
              unavailable = !record.available,
              cls         = ['neo-command-palette-option'],
              metaNodes   = [];

        if (isActive) {
            cls.push('neo-is-active')
        }

        if (unavailable) {
            cls.push('neo-is-unavailable');

            if (record.unavailableReason) {
                metaNodes.push({
                    tag : 'span',
                    cls : ['neo-command-palette-unavailable-pill'],
                    text: record.unavailableReason
                })
            }
        }

        if (record.shortcut) {
            metaNodes.push({
                tag : 'kbd',
                cls : ['neo-command-palette-shortcut'],
                text: record.shortcut
            })
        }

        const headingChildren = [{
            tag : 'span',
            cls : ['neo-command-palette-option-label'],
            text: record.label
        }];

        if (record.group) {
            headingChildren.push({
                tag : 'span',
                cls : ['neo-command-palette-option-group'],
                text: record.group
            })
        }

        const copyChildren = [{
            cls: ['neo-command-palette-option-heading'],
            cn : headingChildren
        }];

        if (record.description) {
            copyChildren.push({
                tag : 'p',
                cls : ['neo-command-palette-option-detail'],
                text: record.description
            })
        }

        const mainChildren = [];

        if (record.iconCls) {
            mainChildren.push({
                tag          : 'span',
                'aria-hidden': 'true',
                cls          : ['neo-command-palette-option-icon', ...record.iconCls.trim().split(/\s+/)]
            })
        }

        mainChildren.push({
            cls: ['neo-command-palette-option-copy'],
            cn : copyChildren
        });

        const optionChildren = [{
            cls: ['neo-command-palette-option-main'],
            cn : mainChildren
        }];

        if (metaNodes.length > 0) {
            optionChildren.push({
                cls: ['neo-command-palette-option-meta'],
                cn : metaNodes
            })
        }

        return {
            tag            : 'li',
            id             : me.getOptionId(record.id),
            role           : 'option',
            'aria-disabled': unavailable ? 'true' : 'false',
            'aria-selected': isActive ? 'true' : 'false',
            cls,
            cn             : optionChildren,
            data           : {
                recordId: String(record.id)
            }
        }
    }

    /**
     * @summary Dismisses the palette, unregisters Main-thread prevent-default keys, and optionally restores focus.
     * @param {Object} [options={}]
     * @param {Boolean} [options.restoreFocus=true]
     * @returns {Promise<Boolean>} `true` when an open palette was closed.
     */
    async close({restoreFocus = true} = {}) {
        const me = this;

        if (!me.isOpen && me.hidden) {
            return false
        }

        const fallbackFocusId = me.fallbackFocusId,
              returnFocusId   = me.returnFocusId,
              windowId        = me.windowId;

        me.unregisterKeyCapture();
        me._hidden      = true;
        me.activeContext = null;

        if (!Neo.config.unitTestMode && me.mounted) {
            await me.unmount()
        } else {
            me.vdom.removeDom = true
        }

        me.fire('close', {palette: me, windowId});

        if (restoreFocus) {
            await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId)
        }

        return true
    }

    /**
     * @summary Computes the polite status announcement for the current filter and record counts.
     * @returns {String}
     * @protected
     */
    computeDefaultStatusText() {
        const me    = this,
              count = me.store?.getCount() ?? 0,
              query = me.query.trim();

        if (me.totalActionCount === 0) {
            return me.emptyActionsTitle
        }

        if (count === 0) {
            return query
                ? `No commands matching "${query}".`
                : me.emptyResultsTitle
        }

        let availableCount = 0;

        for (let i = 0; i < count; i++) {
            if (me.store.getAt(i)?.available) {
                availableCount++
            }
        }

        const noun         = count === 1 ? 'command' : 'commands',
              unavailable  = count - availableCount,
              availability = unavailable > 0 ? ` (${availableCount} available, ${unavailable} unavailable)` : '';

        return query
            ? `${count} ${noun} matching "${query}"${availability}.`
            : `${count} ${noun}${availability}.`
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.unregisterKeyCapture();
        this.store?.destroy?.();
        this._store = null;
        super.destroy(...args)
    }

    /**
     * @summary Chooses the initial active index after opening or filtering: prefers the first `available`
     * match, falling back to `0` when only unavailable commands match, or `-1` when empty.
     * @returns {Number}
     * @protected
     */
    findDefaultActiveIndex() {
        const store = this.store,
              count = store?.getCount() ?? 0;

        if (count === 0) {
            return -1
        }

        for (let i = 0; i < count; i++) {
            if (store.getAt(i)?.available) {
                return i
            }
        }

        return 0
    }

    /**
     * @param {String} recordId
     * @returns {String}
     */
    getOptionId(recordId) {
        return `${this.id}__option-${String(recordId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
    }

    /**
     * @summary Moves the highlighted option by `delta` (`+1` or `-1`) with wrap-around.
     * @param {Number} delta
     */
    moveSelection(delta) {
        const count = this.store?.getCount() ?? 0;

        if (count === 0) {
            return
        }

        const current = this.activeIndex >= 0 ? this.activeIndex : 0,
              next    = (current + delta + count) % count;

        this.setActiveIndex(next)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onBackdropClick(data) {
        if (data.target?.id === this.id) {
            this.close({restoreFocus: true})
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onCloseButtonClick(data) {
        data.cancelBubble = true;
        this.close({restoreFocus: true})
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange(data) {
        this.setQuery(data.value ?? '')
    }

    /**
     * @param {Object} data
     * @protected
     */
    onOptionClick(data) {
        data.cancelBubble = true;

        const me         = this,
              optionNode = data.path?.find(node => node.id === data.currentTarget) ||
                           data.path?.find(node => node.cls?.includes?.('neo-command-palette-option')),
              recordId   = optionNode?.data?.recordId ?? optionNode?.data?.['record-id'];

        if (!recordId) {
            return
        }

        const record = me.store.get(recordId);

        if (!record) {
            return
        }

        const index = me.store.indexOf(record);

        if (index >= 0 && index !== me.activeIndex) {
            me.activeIndex = index
        }

        me.activateRecord(record, {event: data, source: 'pointer'})
    }

    /**
     * @summary Handles combobox/dialog keyboard navigation, activation, Escape dismissal, and Tab trapping.
     * @param {Object} data
     * @protected
     */
    onPaletteKeyDown(data) {
        const me  = this,
              key = data.key;

        if (!me.isOpen) {
            return
        }

        if (key === 'Escape' || CommandPalette.isOpenShortcut(data)) {
            data.cancelBubble = true;
            me.close({restoreFocus: true});
            return
        }

        if (key === 'Tab') {
            data.cancelBubble = true;
            const nextId = data.target?.id === me.closeButtonId ? me.inputId : me.closeButtonId;

            if (!Neo.config.unitTestMode) {
                Neo.main?.DomAccess?.focus?.({
                    id      : nextId,
                    modality: 'keyboard',
                    windowId: me.windowId
                })
            }
            return
        }

        if (key === 'ArrowDown') {
            data.cancelBubble = true;
            me.moveSelection(1);
            return
        }

        if (key === 'ArrowUp') {
            data.cancelBubble = true;
            me.moveSelection(-1);
            return
        }

        if (key === 'Home') {
            data.cancelBubble = true;
            if (me.store.getCount() > 0) {
                me.setActiveIndex(0)
            }
            return
        }

        if (key === 'End') {
            data.cancelBubble = true;
            const count = me.store.getCount();
            if (count > 0) {
                me.setActiveIndex(count - 1)
            }
            return
        }

        if (key === 'Enter') {
            data.cancelBubble = true;
            const record = me.activeIndex >= 0 ? me.store.getAt(me.activeIndex) : null;
            me.activateRecord(record, {event: data, source: 'keyboard'})
        }
    }

    /**
     * @summary Opens the command palette in the target window, refreshes eligible actions, mounts into
     * `document.body`, registers Main-thread prevent-default keys, and focuses the combobox input.
     * @param {Object} [options={}]
     * @param {*} [options.context=null]
     * @param {Function|String|null} [options.fallbackFocusId=null]
     * @param {String|null} [options.returnFocusId=null]
     * @param {String|null} [options.theme=null]
     * @param {Number|String|null} [options.windowId=null]
     * @returns {Promise<Neo.examples.workbench.CommandPalette>}
     */
    async open(options = {}) {
        const me             = this,
              targetWindowId = options.windowId ?? me.windowId ?? me.parentComponent?.windowId ?? null;

        if (!Neo.config.unitTestMode && me.mounted && targetWindowId && me.windowId && targetWindowId !== me.windowId) {
            me.unregisterKeyCapture();
            await me.unmount()
        }

        me.activeContext = options.context ?? null;

        if (options.returnFocusId !== undefined || !me.isOpen) {
            me.returnFocusId = options.returnFocusId ?? null
        }

        if (options.fallbackFocusId !== undefined || !me.isOpen) {
            me.fallbackFocusId = options.fallbackFocusId ?? null
        }

        if (targetWindowId !== null && targetWindowId !== me.windowId) {
            me.windowId = targetWindowId
        }

        const resolvedTheme = options.theme ?? me.parentComponent?.getTheme?.() ?? me.getTheme?.() ?? null;

        if (resolvedTheme && resolvedTheme !== me.theme) {
            me.theme = resolvedTheme
        }

        delete me.vdom.removeDom;
        me._hidden = false;

        me.refreshActions({preserveQuery: false, render: false});
        me.syncVdom(!Neo.config.unitTestMode && me.mounted);

        if (!Neo.config.unitTestMode) {
            if (!me.mounted) {
                await me.initVnode(true)
            }

            me.registerKeyCapture(me.windowId);
            me.scrollActiveOptionIntoView();

            Neo.main?.DomAccess?.focus?.({
                id      : me.inputId,
                modality: 'keyboard',
                windowId: me.windowId
            })
        }

        me.fire('open', {
            context : me.activeContext,
            palette : me,
            windowId: me.windowId
        });

        return me
    }

    /**
     * @summary Pulls fresh action descriptors from {@link #actionProvider} (or {@link #actions}) into {@link #store}.
     * @param {Object} [options={}]
     * @param {Boolean} [options.preserveQuery=true]
     * @param {Boolean} [options.render=true]
     * @returns {Number} Filtered record count.
     */
    refreshActions({preserveQuery = true, render = true} = {}) {
        const me       = this,
              rawItems = Neo.isFunction(me.actionProvider)
                  ? (me.actionProvider({context: me.activeContext, palette: me, windowId: me.windowId}) || [])
                  : (me.actions || []),
              items        = Array.isArray(rawItems) ? rawItems : [],
              queryFilter  = me.store.getFilter('query'),
              previousId   = preserveQuery && me.activeIndex >= 0 ? me.store.getAt(me.activeIndex)?.id : null;

        if (!preserveQuery) {
            me.query = ''
        }

        if (queryFilter) {
            queryFilter.value = me.query
        }

        me.totalActionCount = items.length;
        me.store.clear();

        if (items.length > 0) {
            me.store.add(items)
        }

        let nextIndex = -1;

        if (previousId != null) {
            const preservedRecord = me.store.get(previousId);

            if (preservedRecord) {
                nextIndex = me.store.indexOf(preservedRecord)
            }
        }

        if (nextIndex < 0) {
            nextIndex = me.findDefaultActiveIndex()
        }

        me.activeIndex = nextIndex;
        me.statusText  = me.computeDefaultStatusText();

        if (render) {
            me.syncVdom(true)
        }

        return me.store.getCount()
    }

    /**
     * @param {Number|String|null} windowId
     * @protected
     */
    registerKeyCapture(windowId) {
        if (!windowId || Neo.config.unitTestMode) {
            return
        }

        this.unregisterKeyCapture();
        this.registeredKeyWindowId = windowId;

        Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
            id  : this.inputId,
            keys: PREVENT_INPUT_KEYS,
            windowId
        });

        Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
            id  : this.closeButtonId,
            keys: PREVENT_CLOSE_KEYS,
            windowId
        })
    }

    /**
     * @summary Restores keyboard focus to `returnId` if still mounted and visible, otherwise falls back to
     * `fallbackId` (string or resolver function) so post-action re-projections never drop focus to `<body>`.
     * @param {String|null} returnId
     * @param {Function|String|null} fallbackId
     * @param {Number|String|null} windowId
     * @returns {Promise<String|null>} Focused element id, or `null`.
     */
    async restoreOriginFocus(returnId, fallbackId, windowId) {
        const resolveFallback = () => Neo.isFunction(fallbackId) ? fallbackId() : fallbackId;

        let targetId       = returnId || resolveFallback() || null,
            targetWindowId = windowId;

        if (!targetId) {
            return null
        }

        if (Neo.config.unitTestMode) {
            const targetComponent = Neo.getComponent(targetId);

            if (targetComponent && !targetComponent.isDestroyed && !targetComponent.hidden) {
                targetComponent.focus?.(targetId);
                return targetId
            }

            const fallback = resolveFallback();

            if (fallback && fallback !== targetId) {
                const fallbackComponent = Neo.getComponent(fallback);
                fallbackComponent?.focus?.(fallback);
                return fallback
            }

            return targetId
        }

        if (returnId && Neo.main?.DomAccess?.getBoundingClientRect) {
            const rect = await Neo.main.DomAccess.getBoundingClientRect({
                id      : returnId,
                windowId: targetWindowId
            }).catch(() => null);

            if (!rect || (rect.width <= 0 && rect.height <= 0)) {
                const fallback = resolveFallback();

                if (fallback) {
                    targetId = fallback;
                    const fallbackCmp = Neo.getComponent(fallback);

                    if (fallbackCmp?.windowId) {
                        targetWindowId = fallbackCmp.windowId
                    }
                } else {
                    return null
                }
            }
        }

        Neo.main?.DomAccess?.focus?.({
            id      : targetId,
            windowId: targetWindowId
        });

        return targetId
    }

    /**
     * @summary Updates {@link #activeIndex}, refreshes `aria-activedescendant` and `.neo-is-active`, and
     * scrolls the newly highlighted option into view inside the listbox.
     * @param {Number} index
     * @param {Object} [options={}]
     * @param {Boolean} [options.scroll=true]
     */
    setActiveIndex(index, {scroll = true} = {}) {
        const me    = this,
              count = me.store?.getCount() ?? 0;

        if (count === 0) {
            me.activeIndex = -1;
            me.syncVdom(true);
            return
        }

        const clamped = Math.max(0, Math.min(count - 1, index)),
              record  = me.store.getAt(clamped);

        me.activeIndex = clamped;

        if (record && !record.available && record.unavailableReason) {
            me.statusText = `${record.label} — unavailable: ${record.unavailableReason}.`
        } else {
            me.statusText = me.computeDefaultStatusText()
        }

        me.syncVdom(true);

        if (scroll && record && !Neo.config.unitTestMode && me.mounted) {
            me.scrollActiveOptionIntoView()
        }
    }

    /**
     * @summary Scrolls the currently active `<li role="option">` into view once pending VDOM updates land.
     * @protected
     */
    scrollActiveOptionIntoView() {
        const me = this;

        if (Neo.config.unitTestMode || !me.mounted || me.activeIndex < 0) {
            return
        }

        const record = me.store?.getAt(me.activeIndex);

        if (!record) {
            return
        }

        const optionId = me.getOptionId(record.id),
              windowId = me.windowId;

        Promise.resolve(me.promiseUpdate?.()).catch(() => {}).then(() => {
            if (!me.isDestroyed && me.mounted && !me.hidden) {
                Neo.main?.DomAccess?.scrollIntoView?.({
                    behavior: 'instant',
                    block   : 'nearest',
                    id      : optionId,
                    windowId
                })
            }
        })
    }

    /**
     * @summary Filters {@link #store} by `query`, resets selection to the best matching option, and updates
     * the polite status region.
     * @param {String} query
     */
    setQuery(query) {
        const me          = this,
              normalized  = String(query ?? ''),
              queryFilter = me.store.getFilter('query');

        me.query = normalized;

        if (queryFilter) {
            queryFilter.value = normalized
        }

        me.activeIndex = me.findDefaultActiveIndex();
        me.statusText  = me.computeDefaultStatusText();
        me.syncVdom(true);
        me.scrollActiveOptionIntoView();

        me.fire('filter', {
            count  : me.store.getCount(),
            palette: me,
            query  : normalized
        })
    }

    /**
     * @summary Rebuilds the dialog VDOM from current {@link #store}, {@link #query}, {@link #activeIndex},
     * and {@link #statusText} state.
     * @param {Boolean} [commitUpdate=true]
     * @protected
     */
    syncVdom(commitUpdate = true) {
        const me             = this,
              count          = me.store?.getCount() ?? 0,
              activeRecord   = me.activeIndex >= 0 && me.activeIndex < count ? me.store.getAt(me.activeIndex) : null,
              activeOptionId = activeRecord ? me.getOptionId(activeRecord.id) : undefined,
              optionNodes    = [];

        for (let i = 0; i < count; i++) {
            const record = me.store.getAt(i);

            if (record) {
                optionNodes.push(me.buildOptionVdom(record, i))
            }
        }

        const bodyNode = count > 0
            ? {
                tag         : 'ul',
                id          : me.listboxId,
                role        : 'listbox',
                'aria-label': me.title,
                cls         : ['neo-command-palette-list'],
                cn          : optionNodes
            }
            : {
                tag         : 'div',
                id          : me.listboxId,
                role        : 'listbox',
                'aria-label': me.title,
                cls         : ['neo-command-palette-list'],
                cn          : [{
                    cls: ['neo-command-palette-empty'],
                    cn : [{
                        tag : 'p',
                        cls : ['neo-command-palette-empty-title'],
                        text: me.totalActionCount === 0 ? me.emptyActionsTitle : me.emptyResultsTitle
                    }, {
                        tag : 'p',
                        cls : ['neo-command-palette-empty-description'],
                        text: me.totalActionCount === 0 ? me.emptyActionsDescription : me.emptyResultsDescription
                    }]
                }]
            };

        me.vdom.cn = [{
            id               : me.surfaceId,
            role             : 'dialog',
            'aria-labelledby': me.titleId,
            'aria-modal'     : 'true',
            cls              : ['neo-command-palette-surface'],
            cn               : [{
                cls: ['neo-command-palette-header'],
                cn : [{
                    tag          : 'span',
                    'aria-hidden': 'true',
                    cls          : ['neo-command-palette-search-icon', 'fa', 'fa-magnifying-glass']
                }, {
                    tag                : 'input',
                    id                 : me.inputId,
                    type               : 'text',
                    role               : 'combobox',
                    'aria-autocomplete': 'list',
                    'aria-controls'    : me.listboxId,
                    'aria-expanded'    : 'true',
                    'aria-label'       : me.title,
                    ...(activeOptionId && {'aria-activedescendant': activeOptionId}),
                    autocomplete: 'off',
                    cls         : ['neo-command-palette-input'],
                    placeholder : me.placeholder,
                    spellcheck  : 'false',
                    value       : me.query
                }, {
                    tag : 'span',
                    id  : me.titleId,
                    cls : ['neo-command-palette-title'],
                    text: me.title
                }, {
                    tag         : 'button',
                    id          : me.closeButtonId,
                    type        : 'button',
                    'aria-label': 'Close command palette',
                    cls         : ['neo-command-palette-close'],
                    text        : me.closeButtonText
                }]
            }, bodyNode, {
                cls: ['neo-command-palette-footer'],
                cn : [{
                    tag        : 'p',
                    id         : me.statusId,
                    role       : 'status',
                    'aria-live': 'polite',
                    cls        : ['neo-command-palette-status'],
                    text       : me.statusText
                }, {
                    tag          : 'span',
                    'aria-hidden': 'true',
                    cls          : ['neo-command-palette-legend'],
                    text         : me.legendText
                }]
            }]
        }];

        if (commitUpdate && (me.mounted || Neo.config.unitTestMode) && !me.hidden) {
            me.update()
        }
    }

    /**
     * @summary Toggles the palette closed when already open in the same window, or opens it in the requested window.
     * @param {Object} [options={}]
     * @returns {Promise<Boolean|Neo.examples.workbench.CommandPalette>}
     */
    async toggle(options = {}) {
        const me             = this,
              targetWindowId = options.windowId ?? me.windowId ?? me.parentComponent?.windowId ?? null;

        if (me.isOpen && (!targetWindowId || !me.windowId || targetWindowId === me.windowId)) {
            return me.close({restoreFocus: true})
        }

        return me.open(options)
    }

    /**
     * @protected
     */
    unregisterKeyCapture() {
        const windowId = this.registeredKeyWindowId;

        if (!windowId || Neo.config.unitTestMode) {
            this.registeredKeyWindowId = null;
            return
        }

        this.registeredKeyWindowId = null;

        Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
            id      : this.inputId,
            windowId
        });

        Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
            id      : this.closeButtonId,
            windowId
        })
    }
}

export default Neo.setupClass(CommandPalette);
