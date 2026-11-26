import ClassSystemUtil    from '../../src/util/ClassSystem.mjs';
import CommandActionList  from './CommandActionList.mjs';
import CommandActionModel from './CommandActionModel.mjs';
import Component          from '../../src/component/Base.mjs';
import Container          from '../../src/container/Base.mjs';
import Dialog             from '../../src/dialog/Base.mjs';
import NeoArray           from '../../src/util/Array.mjs';
import Store              from '../../src/data/Store.mjs';
import TextField          from '../../src/form/field/Text.mjs';

/**
 * @summary Reusable keyboard-first command palette prototype composed from `Neo.dialog.Base`,
 * `Neo.form.field.Text`, `Neo.list.Base`, and `Neo.main.addon.Navigator`.
 *
 * `CommandPalette` keeps contextual action discovery decoupled from any single application's state
 * provider or window topology. Consumers supply action descriptors (`id`, `label`, `group`,
 * `description`, `keywords`, `shortcut`, `iconCls`, `available`, `unavailableReason`, `managesFocus`,
 * `handler`) statically via {@link #actions} or dynamically on each open via {@link #actionProvider},
 * backed by a `Neo.data.Store` of {@link Neo.examples.workbench.CommandActionModel} records.
 *
 * ### Engine Primitive Composition
 * - **`Neo.dialog.Base` (`modal: true`, `trapFocus: true`, `draggable: false`, `resizable: false`):**
 *   owns modal mask synchronization (`DomAccess.syncModalMask`), DOM focus trapping (`DomAccess.trapFocus`),
 *   `Escape` dismissal (`keys: {Escape: 'onKeyDownEscape'}`), header close button routing, and arrival focus
 *   onto the query field (`Dialog#focusOnArrival`).
 * - **`Neo.form.field.Text` (`role: 'combobox'`) + `CommandActionList` (`Neo.list.Base`, `role: 'listbox'`):**
 *   paired via `navigator: {eventSource: queryField.getInputElId(), wrap: true}` (`ComboBox` picker pattern)
 *   so `ArrowDown`, `ArrowUp`, `Home`, `End`, `Enter`, `aria-activedescendant`, and smooth scrolling execute
 *   directly on the Main thread via `Neo.main.addon.Navigator`.
 * - **Explicit unavailable & empty states:** unavailable actions stay navigable (`aria-disabled="true"`) with
 *   visible reason pills and announce refusals through `role="status"` (`aria-live="polite"`) without invoking
 *   their handler or closing the dialog.
 *
 * @class Neo.examples.workbench.CommandPalette
 * @extends Neo.dialog.Base
 */
class CommandPalette extends Dialog {
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
         * @member {Boolean} autoShow=false
         */
        autoShow: false,
        /**
         * Keep the instance across open/close cycles so consumers reuse one palette per workspace/viewport.
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * Visible label on the dialog header close button.
         * @member {String} closeButtonText='Esc'
         */
        closeButtonText: 'Esc',
        /**
         * @member {String[]} cls=['neo-command-palette','neo-command-palette-surface']
         */
        cls: ['neo-command-palette', 'neo-command-palette-surface'],
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            cls   : ['neo-command-palette-body'],
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Boolean} draggable=false
         */
        draggable: false,
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
         * @member {Boolean} hidden=true
         */
        hidden: true,
        /**
         * Keyboard hint legend displayed in the palette footer on wide viewports.
         * @member {String} legendText='↑↓ navigate · Enter run · Esc close'
         */
        legendText: '↑↓ navigate · Enter run · Esc close',
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
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
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * @member {String} role='dialog'
         */
        role: 'dialog',
        /**
         * Backing store of {@link Neo.examples.workbench.CommandActionModel} records.
         * @member {Neo.data.Store|Object|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Accessible dialog title and header label.
         * @member {String|null} title='Command Palette'
         */
        title: 'Command Palette',
        /**
         * @member {Boolean} trapFocus=true
         */
        trapFocus: true,
        /**
         * Explicit upper-third viewport centering preserved by `Neo.dialog.Base#initVnode` across both
         * `.neo-body-viewport` and plain-`<body>` applications (`WebDesktop`, component test hosts).
         * @member {Object} wrapperStyle
         */
        wrapperStyle: {
            left     : '50%',
            top      : 'clamp(1rem, 10vh, 6rem)',
            transform: 'translateX(-50%)'
        }
    }

    /**
     * Child `CommandActionList` (`Neo.list.Base`) bound to {@link #store}.
     * @member {Neo.examples.workbench.CommandActionList|null} actionList=null
     */
    actionList = null
    /**
     * Arbitrary consumer context passed to {@link #open} and forwarded to {@link #actionProvider} / handlers.
     * @member {*} activeContext=null
     */
    activeContext = null
    /**
     * Zero-based index of the currently highlighted record in {@link #store}, or `-1` when empty.
     * @member {Number} activeIndex=-1
     */
    activeIndex = -1
    /**
     * Empty-state child component shown when {@link #store} contains zero visible records.
     * @member {Neo.component.Base|null} emptyState=null
     */
    emptyState = null
    /**
     * Fallback DOM element id (or resolver `() => String|null`) focused when `returnFocusId` is unmounted.
     * @member {Function|String|null} fallbackFocusId=null
     */
    fallbackFocusId = null
    /**
     * Footer keyboard-legend child component.
     * @member {Neo.component.Base|null} legendComponent=null
     */
    legendComponent = null
    /**
     * Combobox search `Neo.form.field.Text` child component.
     * @member {Neo.form.field.Text|null} queryField=null
     */
    queryField = null
    /**
     * Current filter query text in {@link #queryField}.
     * @member {String} query=''
     */
    query = ''
    /**
     * Origin DOM element id captured before opening so dismissal restores keyboard focus.
     * @member {String|null} returnFocusId=null
     */
    returnFocusId = null
    /**
     * Polite `role="status"` child component announcing counts and unavailable action reasons.
     * @member {Neo.component.Base|null} statusComponent=null
     */
    statusComponent = null
    /**
     * Live polite status text announced by {@link #statusComponent}.
     * @member {String} statusText=''
     */
    statusText = ''
    /**
     * Unfiltered count of actions supplied on the latest {@link #refreshActions} pass.
     * @member {Number} totalActionCount=0
     */
    totalActionCount = 0
    /**
     * Record id whose explicit activation refusal message is currently displayed in `statusComponent`,
     * preventing trailing initial `neonavigate` echoes for the same record from overwriting it.
     * @member {String|null} #refusalRecordId=null
     */
    #refusalRecordId = null
    /**
     * Guards re-entrant `queryField` `change` events when {@link #setQuery} or {@link #refreshActions}
     * updates the field programmatically.
     * @member {Boolean} #syncingQueryField=false
     */
    #syncingQueryField = false

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

        me.vdom['aria-label'] = me.title;
        me.vdom['aria-modal'] = 'true';

        me.addDomListeners({
            keydown: me.onDialogKeyDown,
            scope  : me
        });

        if (me.actions?.length > 0 && me.totalActionCount === 0) {
            me.refreshActions({preserveQuery: false})
        } else {
            me.syncPresentation()
        }
    }

    /**
     * @returns {String|null}
     */
    get closeButtonId() {
        return this.headerToolbar?.getAction?.('close')?.id ?? null
    }

    /**
     * @returns {String|null}
     */
    get inputId() {
        return this.queryField?.getInputElId() ?? null
    }

    /**
     * @returns {Boolean}
     */
    get isOpen() {
        return !this.hidden && (this.mounted || Boolean(this.mountFlight))
    }

    /**
     * @returns {String|null}
     */
    get listboxId() {
        return this.actionList?.id ?? null
    }

    /**
     * @returns {String|null}
     */
    get statusId() {
        return this.statusComponent?.id ?? null
    }

    /**
     * @summary Executes an available command or announces why an unavailable command was refused.
     * @param {Neo.examples.workbench.CommandActionModel|null} record
     * @param {Object} [meta={}]
     * @param {Object} [meta.event=null]
     * @param {String} [meta.source='keyboard'] `'keyboard'` | `'pointer'` | `'programmatic'`
     * @returns {Promise<Object>}
     */
    async activateRecord(record, {event = null, source = 'keyboard'} = {}) {
        const me = this;

        if (!record) {
            return {executed: false, reason: 'no-selection', record: null, result: undefined}
        }

        if (!record.available) {
            const reason = record.unavailableReason || 'Unavailable in the current state';

            me.#refusalRecordId = String(record.id);
            me.setStatusText(`${record.label} is unavailable: ${reason}.`);
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
            this.refreshActions({preserveQuery: this.isOpen})
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        super.afterSetTitle(value, oldValue);

        const me = this;

        if (value) {
            me.vdom['aria-label'] = value;

            if (me.queryField) {
                me.queryField.getInputEl()['aria-label'] = value;
                me.queryField.update()
            }

            if (me.actionList) {
                me.actionList.vdom['aria-label'] = value;
                me.actionList.update()
            }

            me.update()
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
     * @summary Dismisses the palette dialog via `Neo.dialog.Base#unmount` and optionally restores origin focus.
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

        me._hidden       = true;
        me.activeContext = null;

        if (me.mountFlight) {
            await me.mountFlight
        } else if (me.mounted) {
            await me.unmount()
        } else {
            me.vdom.removeDom = true
        }

        me.fire('hide');
        me.fire('close', {palette: me, windowId});

        if (restoreFocus) {
            await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId)
        }

        return true
    }

    /**
     * @summary Routes `Neo.dialog.Base` header close clicks and `Escape` presses through {@link #close}.
     */
    closeOrHide() {
        return this.close({restoreFocus: true})
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
     * @summary Configures the `Neo.dialog.Base` header toolbar with the title and `Esc` close button only.
     */
    createHeader() {
        const me = this;

        me.headerConfig = {
            actions: ['close'],
            cls    : ['neo-header-toolbar', 'neo-toolbar', 'neo-command-palette-titlebar'],
            ...me.headerConfig,
            actionMap: {
                close: () => ({
                    action: 'close',
                    cls   : ['neo-command-palette-close'],
                    text  : me.closeButtonText,
                    vdom  : {'aria-label': 'Close command palette'}
                }),
                ...me.headerConfig?.actionMap
            }
        };

        super.createHeader()
    }

    /**
     * @summary Builds the query `TextField`, `CommandActionList` (`Navigator`-paired), empty state, and docked status footer.
     */
    createItems() {
        const me = this;

        if (!me.queryField) {
            me.statusComponent = Neo.create(Component, {
                appName : me.appName,
                cls     : ['neo-command-palette-status'],
                flex    : 1,
                role    : 'status',
                tag     : 'p',
                text    : me.statusText,
                vdom    : {tag: 'p', 'aria-live': 'polite'},
                windowId: me.windowId
            });

            me.legendComponent = Neo.create(Component, {
                appName : me.appName,
                cls     : ['neo-command-palette-legend'],
                flex    : 'none',
                tag     : 'span',
                text    : me.legendText,
                vdom    : {tag: 'span', 'aria-hidden': 'true'},
                windowId: me.windowId
            });

            me.headers = [
                ...(me.headers || []),
                Neo.create(Container, {
                    appName : me.appName,
                    cls     : ['neo-command-palette-footer'],
                    dock    : 'bottom',
                    flex    : 'none',
                    items   : [me.statusComponent, me.legendComponent],
                    layout  : {ntype: 'hbox', align: 'center'},
                    windowId: me.windowId
                })
            ];

            me.queryField = Neo.create(TextField, {
                appName     : me.appName,
                autoComplete: false,
                clearable   : false,
                cls         : ['neo-command-palette-query-field'],
                emptyValue  : '',
                flex        : 1,
                hideLabel   : true,
                // Disable Field's non-bubbling KeyNavigation so Escape and Ctrl+K/F1 reach the enclosing Dialog.
                keys           : null,
                listeners      : {change: me.onQueryFieldChange, scope: me},
                placeholderText: me.placeholder,
                role           : 'combobox',
                spellCheck     : false,
                value          : '',
                windowId       : me.windowId
            });

            const searchBar = Neo.create(Container, {
                appName : me.appName,
                cls     : ['neo-command-palette-header'],
                flex    : 'none',
                layout  : {ntype: 'hbox', align: 'center'},
                windowId: me.windowId,
                items   : [{
                    module  : Component,
                    appName : me.appName,
                    cls     : ['neo-command-palette-search-icon', 'fa', 'fa-magnifying-glass'],
                    flex    : 'none',
                    tag     : 'span',
                    vdom    : {tag: 'span', 'aria-hidden': 'true'},
                    windowId: me.windowId
                }, me.queryField]
            });

            me.actionList = Neo.create(CommandActionList, {
                appName  : me.appName,
                flex     : 1,
                listeners: {
                    createItems : me.onListCreateItems,
                    itemClick   : me.onListItemClick,
                    itemNavigate: me.onListItemNavigate,
                    scope       : me
                },
                navigator: {
                    // Leave Enter activation on the App-worker FIFO queue after input filtering so rapid
                    // type-then-Enter never races the async list VDOM round-trip on Main.
                    clickSelector: '[data-command-enter]',
                    eventSource  : me.queryField.getInputElId(),
                    windowId     : me.windowId,
                    wrap         : true
                },
                store   : me.store,
                windowId: me.windowId
            });

            const inputEl = me.queryField.getInputEl();

            inputEl['aria-autocomplete'] = 'list';
            inputEl['aria-controls']     = me.actionList.id;
            inputEl['aria-expanded']     = 'true';
            inputEl['aria-label']        = me.title;

            me.actionList.vdom['aria-label'] = me.title;

            me.emptyState = Neo.create(Component, {
                appName : me.appName,
                cls     : ['neo-command-palette-empty'],
                flex    : 'none',
                hidden  : true,
                windowId: me.windowId,
                vdom    : {
                    cn: [{
                        tag : 'p',
                        cls : ['neo-command-palette-empty-title'],
                        text: me.emptyResultsTitle
                    }, {
                        tag : 'p',
                        cls : ['neo-command-palette-empty-description'],
                        text: me.emptyResultsDescription
                    }]
                }
            });

            me._items = [searchBar, me.actionList, me.emptyState]
        }

        super.createItems()
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
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
     * @summary Suppresses `Component#revertFocusOnDeparture` during explicit `close()` handling so async
     * post-action focus restoration (`fallbackFocusId`, `managesFocus: true`) owns the handback cleanly.
     * @returns {Neo.component.Base|null}
     */
    getFocusReturnTarget() {
        return null
    }

    /**
     * @summary Resolves the rendered `<li role="option">` DOM id for a record or record id.
     * @param {Neo.examples.workbench.CommandActionModel|String} recordOrId
     * @returns {String|null}
     */
    getOptionId(recordOrId) {
        if (!this.actionList || recordOrId == null) {
            return null
        }

        const record = Neo.isRecord(recordOrId) ? recordOrId : this.store?.get(recordOrId);

        return record ? this.actionList.getItemId(record) : null
    }

    /**
     * @summary Handles open-shortcut toggle-close and FIFO-ordered `Enter` activation against {@link #store}.
     * @param {Object} data
     * @protected
     */
    onDialogKeyDown(data) {
        const me = this;

        if (!me.isOpen) {
            return
        }

        if (CommandPalette.isOpenShortcut(data)) {
            data.cancelBubble = true;
            me.close({restoreFocus: true});
            return
        }

        if (data.key === 'Enter' && data.target?.id === me.inputId) {
            data.cancelBubble = true;
            const record = me.activeIndex >= 0 ? me.store?.getAt(me.activeIndex) : null;
            me.activateRecord(record, {event: data, source: 'keyboard'})
        }
    }

    /**
     * @summary Synchronizes `Navigator` active highlight once `CommandActionList` finishes rendering filtered items.
     * @protected
     */
    onListCreateItems() {
        this.syncNavigatorHighlight()
    }

    /**
     * @summary Activates or refuses the pointer-clicked option record.
     * @param {Object} data
     * @param {Neo.examples.workbench.CommandActionModel} data.record
     * @protected
     */
    onListItemClick({record}) {
        if (!record) {
            return
        }

        const index = this.store.indexOf(record);

        if (index >= 0) {
            this.activeIndex = index
        }

        this.activateRecord(record, {source: 'pointer'})
    }

    /**
     * @summary Updates {@link #activeIndex} and announces unavailable reasons when `Navigator` moves across options.
     * @param {Object} data
     * @param {Number} [data.activeIndex]
     * @param {Neo.examples.workbench.CommandActionModel} [data.record]
     * @protected
     */
    onListItemNavigate(data) {
        const me     = this,
              record = data?.record || (Neo.isNumber(data?.activeIndex) ? me.store?.getAt(data.activeIndex) : null);

        if (!record) {
            return
        }

        const nextIndex = me.store.indexOf(record);

        if (me.#refusalRecordId && String(record.id) === me.#refusalRecordId && nextIndex === me.activeIndex) {
            return
        }

        me.#refusalRecordId = null;
        me.activeIndex      = nextIndex;

        if (!record.available && record.unavailableReason) {
            me.setStatusText(`${record.label} — unavailable: ${record.unavailableReason}.`)
        } else {
            me.setStatusText(me.computeDefaultStatusText())
        }
    }

    /**
     * @param {Object} data
     * @param {String|null} data.value
     * @protected
     */
    onQueryFieldChange({value}) {
        if (!this.#syncingQueryField) {
            this.setQuery(value ?? '')
        }
    }

    /**
     * @summary Opens the command palette in the target window, refreshes eligible actions, mounts via
     * `Neo.dialog.Base#show`, synchronizes `Navigator` highlight, and focuses the combobox input.
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

        if (me.mounted && targetWindowId && me.windowId && targetWindowId !== me.windowId) {
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

        me.refreshActions({preserveQuery: false});

        me.show(false);

        if (me.mountFlight) {
            await me.mountFlight
        }

        me.syncNavigatorHighlight();
        me.queryField?.focus(undefined, false, true, 'keyboard');

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
     * @returns {Number} Filtered record count.
     */
    refreshActions({preserveQuery = true} = {}) {
        const me       = this,
              rawItems = Neo.isFunction(me.actionProvider)
                  ? (me.actionProvider({context: me.activeContext, palette: me, windowId: me.windowId}) || [])
                  : (me.actions || []),
              items       = Array.isArray(rawItems) ? rawItems : [],
              queryFilter = me.store.getFilter('query'),
              previousId  = preserveQuery && me.activeIndex >= 0 ? me.store.getAt(me.activeIndex)?.id : null;

        if (!preserveQuery) {
            me.query = '';

            if (me.queryField) {
                me.#syncingQueryField            = true;
                me.queryField.reportedInputValue = null;
                me.queryField.value              = '';
                me.#syncingQueryField            = false
            }
        }

        if (queryFilter) {
            queryFilter.value = me.query
        }

        me.totalActionCount = items.length;
        me.store.clear();

        if (items.length > 0) {
            me.store.add(items)
        } else {
            me.actionList?.createItems(!me.mounted)
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

        me.#refusalRecordId = null;
        me.activeIndex      = nextIndex;
        me.syncPresentation();

        return me.store.getCount()
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

        if (returnId) {
            const originCmp      = Neo.getComponent(returnId),
                  cmpUnavailable = Boolean(originCmp && (originCmp.isDestroyed || originCmp.hidden));

            let domUnavailable = false;

            if (!cmpUnavailable && Neo.main?.DomAccess?.getBoundingClientRect) {
                const rect = await Neo.main.DomAccess.getBoundingClientRect({
                    id      : returnId,
                    windowId: targetWindowId
                }).catch(() => null);

                domUnavailable = !rect || (rect.width <= 0 && rect.height <= 0)
            }

            if (cmpUnavailable || domUnavailable) {
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

        const targetCmp = Neo.getComponent(targetId);

        if (targetCmp && !targetCmp.isDestroyed && !targetCmp.hidden) {
            targetCmp.focus(targetId)
        } else {
            Neo.main?.DomAccess?.focus?.({
                id      : targetId,
                windowId: targetWindowId
            })
        }

        return targetId
    }

    /**
     * @summary Filters {@link #store} by `query`, resets highlight to the best matching option, and updates
     * the polite status region and empty state.
     * @param {String} query
     */
    setQuery(query) {
        const me          = this,
              normalized  = String(query ?? ''),
              queryFilter = me.store.getFilter('query');

        me.query = normalized;

        if (me.queryField && me.queryField.value !== normalized) {
            me.#syncingQueryField = true;
            me.queryField.value   = normalized;
            me.#syncingQueryField = false
        }

        if (queryFilter) {
            queryFilter.value = normalized
        }

        me.#refusalRecordId = null;
        me.activeIndex      = me.findDefaultActiveIndex();
        me.syncPresentation();

        me.fire('filter', {
            count  : me.store.getCount(),
            palette: me,
            query  : normalized
        })
    }

    /**
     * @summary Updates {@link #statusText} and synchronizes the `role="status"` footer label.
     * @param {String} text
     * @protected
     */
    setStatusText(text) {
        this.statusText = text;

        if (this.statusComponent) {
            this.statusComponent.text = text
        }
    }

    /**
     * @summary Directs `Neo.main.addon.Navigator` (`CommandActionList#focusIndex`) to {@link #activeIndex}
     * while mounted and non-empty.
     * @protected
     */
    syncNavigatorHighlight() {
        const me = this;

        if (!me.mounted || !me.actionList || me.activeIndex < 0 || (me.store?.getCount() ?? 0) === 0) {
            return
        }

        me.actionList._focusIndex = -1;
        me.actionList.focusIndex  = me.activeIndex
    }

    /**
     * @summary Synchronizes listbox visibility, zero-result empty copy, and polite status text with {@link #store}.
     * @protected
     */
    syncPresentation() {
        const me    = this,
              count = me.store?.getCount() ?? 0;

        me.setStatusText(me.computeDefaultStatusText());

        if (me.actionList) {
            const listCls = me.actionList.cls;
            NeoArray.toggle(listCls, 'neo-is-empty', count === 0);
            me.actionList.cls = listCls
        }

        if (me.emptyState) {
            const [titleNode, descNode] = me.emptyState.vdom.cn;

            titleNode.text = me.totalActionCount === 0 ? me.emptyActionsTitle : me.emptyResultsTitle;
            descNode.text  = me.totalActionCount === 0 ? me.emptyActionsDescription : me.emptyResultsDescription;

            if (count === 0) {
                if (me.emptyState.hidden) {
                    me.emptyState.hidden = false
                } else {
                    me.emptyState.update()
                }
            } else if (!me.emptyState.hidden) {
                me.emptyState.hidden = true
            }
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
}

export default Neo.setupClass(CommandPalette);
