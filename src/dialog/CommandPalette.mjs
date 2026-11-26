import ClassSystemUtil    from '../util/ClassSystem.mjs';
import CommandActionModel from './model/CommandAction.mjs';
import CommandPaletteList from './CommandPaletteList.mjs';
import Component          from '../component/Base.mjs';
import Container          from '../container/Base.mjs';
import Dialog             from './Base.mjs';
import SearchFilter       from '../collection/SearchFilter.mjs';
import Store              from '../data/Store.mjs';
import TextField          from '../form/field/Text.mjs';

const SEARCH_FIELDS     = ['label', 'group', 'description', 'shortcut', 'unavailableReason', 'keywords'],
      SEARCH_FIELD_TEXT = {keywords: v => Array.isArray(v) ? v.join(' ') : SearchFilter.getDefaultText(v)},
      SEARCH_OWNER_ROLE = 'command-palette-search';

/**
 * @summary Reusable modal command palette composed from `Neo.dialog.Base`, `Neo.form.field.Text`,
 * `Neo.dialog.CommandPaletteList` (`Neo.list.Base`), and `Neo.main.addon.Navigator`.
 *
 * Applications import `Neo.dialog.CommandPalette` (`ntype: 'command-palette'`), supply a static
 * {@link #commands} array or dynamic {@link #commandProvider} callback, and call {@link #show},
 * {@link #open}, or {@link #toggle} (optionally setting `enableShortcuts: true` with {@link #owner}
 * for mount-scoped `Ctrl+K` / `Meta+K` / `F1` shortcut binding). Application permissions, command
 * execution, and domain state remain with the caller while the dialog owns `SearchFilter` filtering,
 * `Navigator` option movement, `Escape` and close-button dismissal, polite `role="status"` feedback,
 * non-focus-stealing `role="alert"` error surfacing, owner teardown, and focus restoration.
 *
 * @class Neo.dialog.CommandPalette
 * @extends Neo.dialog.Base
 */
class CommandPalette extends Dialog {
    static config = {
        /** @member {String} className='Neo.dialog.CommandPalette' @protected */
        className: 'Neo.dialog.CommandPalette',
        /** @member {String} ntype='command-palette' @protected */
        ntype: 'command-palette',
        /** @member {Boolean} autoInitVnode=false */
        autoInitVnode: false,
        /** @member {Boolean} autoMount=false */
        autoMount: false,
        /** @member {Boolean} autoShow=false */
        autoShow: false,
        /** @member {String} closeAction='hide' */
        closeAction: 'hide',
        /** @member {String} closeButtonText='Esc' */
        closeButtonText: 'Esc',
        /** @member {String[]} cls=['neo-command-palette','neo-command-palette-surface'] @reactive */
        cls: ['neo-command-palette', 'neo-command-palette-surface'],
        /** @member {Function|null} commandProvider=null */
        commandProvider: null,
        /** @member {Object[]} commands_=[] @reactive */
        commands_: [],
        /** @member {Object} containerConfig */
        containerConfig: {cls: ['neo-command-palette-body'], layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {Boolean} draggable=false @reactive */
        draggable: false,
        /** @member {String} emptyCommandsDescription='No commands are registered for this view yet.' */
        emptyCommandsDescription: 'No commands are registered for this view yet.',
        /** @member {String} emptyCommandsTitle='No commands available' */
        emptyCommandsTitle: 'No commands available',
        /** @member {String} emptyResultsDescription='Try a different command name, group, or keyword.' */
        emptyResultsDescription: 'Try a different command name, group, or keyword.',
        /** @member {String} emptyResultsTitle='No matching commands' */
        emptyResultsTitle: 'No matching commands',
        /** @member {Boolean} enableShortcuts_=false @reactive */
        enableShortcuts_: false,
        /** @member {Number|null} errorDismissDelay=5000 */
        errorDismissDelay: 5000,
        /** @member {Function|String|null} fallbackFocusId=null */
        fallbackFocusId: null,
        /** @member {Boolean} hidden=true @reactive */
        hidden: true,
        /** @member {String} legendText='↑↓ navigate · Enter run · Esc close' */
        legendText: '↑↓ navigate · Enter run · Esc close',
        /** @member {Boolean} modal=true @reactive */
        modal: true,
        /** @member {Neo.component.Base|null} owner_=null @reactive */
        owner_: null,
        /** @member {String} parentId='document.body' @reactive */
        parentId: 'document.body',
        /** @member {String} placeholder_='Type a command or search...' @reactive */
        placeholder_: 'Type a command or search...',
        /** @member {Boolean} resizable=false @reactive */
        resizable: false,
        /** @member {String} role='dialog' @reactive */
        role: 'dialog',
        /** @member {Neo.data.Store|Object|null} store_=null @reactive */
        store_: null,
        /** @member {String|null} title='Command Palette' @reactive */
        title: 'Command Palette',
        /** @member {Boolean} trapFocus=true @reactive */
        trapFocus: true,
        /** @member {Object} wrapperStyle */
        wrapperStyle: {left: '50%', top: 'clamp(1rem, 10vh, 6rem)', transform: 'translateX(-50%)'}
    }

    actionList        = null
    activeContext     = null
    activeIndex       = -1
    emptyState        = null
    errorNotice       = null
    legendComponent   = null
    queryField        = null
    query             = ''
    returnFocusId     = null
    statusComponent   = null
    statusText        = ''
    totalCommandCount = 0

    static #searchMatcher    = null
    #activeFallbackFocusId   = null
    #appNameDerivedFromOwner = false
    #errorNoticeGeneration   = 0
    #openGeneration          = 0
    #ownerCleanups           = []
    #refusalRecordId         = null
    #returnFocusExplicit     = false
    #shortcutHosts           = new Map()
    #showFromOpen            = false
    #suppressHideFocusReturn = false
    #syncingOwnerWindow      = false
    #syncingQueryField       = false
    #themeDerivedFromOwner   = false
    #windowDerivedFromOwner  = false

    /**
     * @summary Checks whether a serialized Neo keyboard event matches `Ctrl+K`, `Meta+K`, or `F1`.
     * @param {Object} data
     * @returns {Boolean}
     */
    static isOpenShortcut(data) {
        if (!data || data.altKey || data.shiftKey) return false;
        const key = data.key;
        if ((data.ctrlKey || data.metaKey) && typeof key === 'string' && key.toLowerCase() === 'k') return true;
        return !data.ctrlKey && !data.metaKey && key === 'F1'
    }

    /**
     * @summary Evaluates multi-token command search via {@link Neo.collection.SearchFilter}.
     * @param {Neo.dialog.model.CommandAction|Object} record
     * @param {String} query
     * @returns {Boolean}
     */
    static matchesQuery(record, query) {
        const matcher = this.#searchMatcher ??= Neo.create(SearchFilter, {fields: SEARCH_FIELDS, fieldText: SEARCH_FIELD_TEXT});
        matcher.value = String(query ?? '');
        return !matcher.isFiltered(record)
    }

    /**
     * @param {...*} args
     * @returns {Object}
     */
    mergeConfig(...args) {
        const config = super.mergeConfig(...args),
              owner  = config.owner;

        if (owner) {
            if (config.appName == null && owner.appName) {
                config.appName                = owner.appName;
                this.#appNameDerivedFromOwner = true
            }
            config.parentComponent ??= owner;

            const ownerTheme = owner.getTheme?.();
            if (config.theme == null && ownerTheme) {
                config.theme                = ownerTheme;
                this.#themeDerivedFromOwner = true
            }
            if (config.windowId == null && owner.windowId != null) {
                config.windowId              = owner.windowId;
                this.#windowDerivedFromOwner = true
            }
        }

        return config
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;
        me.vdom['aria-label'] = me.title;
        me.vdom['aria-modal'] = 'true';
        me.addDomListeners({keydown: me.onDialogKeyDown, scope: me});

        if (me.commands?.length > 0 && me.totalCommandCount === 0) {
            me.refreshCommands({preserveQuery: false})
        } else {
            me.syncPresentation()
        }
    }

    get closeButtonId() { return this.headerToolbar?.getAction?.('close')?.id ?? null }
    get inputId()       { return this.queryField?.getInputElId() ?? null }
    get isOpen()        { return !this.isDestroyed && !this.hidden && (this.mounted || Boolean(this.mountFlight)) }
    get listboxId()     { return this.actionList?.id ?? null }
    get statusId()      { return this.statusComponent?.id ?? null }

    /**
     * @summary Executes an available command, refuses unavailable or unresolved handlers, and catches
     * sync/async command failures so focus restoration and handled UI notifications complete cleanly.
     * @param {Neo.dialog.model.CommandAction|null} record
     * @param {Object} [meta={}]
     * @returns {Promise<Object>}
     */
    async activateRecord(record, {event = null, source = 'keyboard'} = {}) {
        const me = this;
        if (!record) return {executed: false, reason: 'no-selection', record: null, result: undefined};

        if (record.available === false) {
            const reason = record.unavailableReason || 'Unavailable in the current state';
            me.#refusalRecordId = String(record.id);
            me.setStatusText(`${record.label} is unavailable: ${reason}.`);
            me.fire('unavailableCommand', {
                context      : me.activeContext, event, palette: me, reason, record,
                triggerSource: source, windowId: me.windowId
            });
            return {executed: false, reason, record, result: undefined}
        }

        const context  = me.activeContext,
              windowId = me.windowId,
              resolved = me.#resolveCommandHandler(record.handler);

        if (!Neo.isFunction(resolved.fn)) {
            const error   = new Error(`Command "${record.id}" handler could not be resolved`),
                  message = `${record.label} failed: command handler could not be resolved.`;
            me.#reportCommandFailure(record, error, 'unresolved-handler', message, {context, event, source, windowId});
            return {error, executed: false, reason: 'unresolved-handler', record, result: undefined}
        }

        const fallbackFocusId = me.#activeFallbackFocusId ?? me.fallbackFocusId,
              managesFocus    = Boolean(record.managesFocus),
              returnFocusId   = me.returnFocusId;

        me.#suppressHideFocusReturn = true;
        try {
            const closing = me.closeOrHide(false);
            if (closing?.then) await closing
        } finally {
            me.#suppressHideFocusReturn = false
        }

        const closedGeneration = me.#openGeneration;
        let result;

        try {
            result = await resolved.fn.call(resolved.scope, {context, event, palette: me, record, source, windowId})
        } catch (error) {
            const detail  = error?.message ? String(error.message) : String(error || 'Command failed'),
                  message = `${record.label} failed: ${detail}`;
            me.#reportCommandFailure(record, error, 'handler-error', message, {context, event, source, windowId});

            if (!managesFocus && !me.isDestroyed && !me.isOpen && me.#openGeneration === closedGeneration) {
                await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId, closedGeneration)
            }
            return {error, executed: false, reason: 'handler-error', record, result: undefined}
        }

        if (!me.isDestroyed) {
            me.fire('select', {context, event, palette: me, record, result, triggerSource: source, windowId})
        }
        if (!managesFocus && !me.isDestroyed && !me.isOpen && me.#openGeneration === closedGeneration) {
            await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId, closedGeneration)
        }

        return {executed: true, reason: null, record, result}
    }

    /** @protected */
    afterSetCommands(value, oldValue) {
        if (oldValue !== undefined && !this.commandProvider && this.store) {
            this.refreshCommands({preserveQuery: this.isOpen})
        }
    }

    /** @protected */
    afterSetEnableShortcuts(value, oldValue) {
        if (oldValue === undefined) return;
        value && this.owner
            ? this.registerShortcutHost(this.owner, Boolean(this.owner.mounted))
            : !value && this.#clearAllShortcutHosts()
    }

    /** @protected */
    afterSetOwner(value, oldValue) {
        const me = this;
        me.#detachOwner(oldValue);

        if (oldValue && me.parentComponent === oldValue && (!value || value.isDestroyed)) {
            me.parentComponent = null
        }
        if (!value || value.isDestroyed || value.isDestroying) return;

        if (value.appName && (!me.appName || me.#appNameDerivedFromOwner || me.appName === oldValue?.appName)) {
            me.#appNameDerivedFromOwner = true;
            me.appName                  = value.appName
        }
        if (!me.parentComponent || me.parentComponent === oldValue) {
            me.parentComponent = value
        }
        if (value.windowId != null && (me.windowId == null || me.#windowDerivedFromOwner || me.windowId === oldValue?.windowId)) {
            me.#windowDerivedFromOwner = true;
            me.#syncOwnerWindowId(value.windowId)
        }

        const ownerTheme = value.getTheme?.();
        if (ownerTheme && (!me.theme || me.#themeDerivedFromOwner || me.theme === oldValue?.getTheme?.())) {
            me.#themeDerivedFromOwner = true;
            me.theme                  = ownerTheme
        }

        if (value instanceof Neo.core.Base) {
            const observe = (key, fn) => value.isConfig?.(key) && me.#ownerCleanups.push(me.observeConfig(value, key, fn));

            observe('isDestroying', destroying => {
                if (destroying && me.owner === value && !me.isDestroyed) me.#handleOwnerDestroy(value)
            });

            observe('mounted', mounted => {
                if (me.isDestroyed || me.owner !== value) return;
                me.registerShortcutHost(value, Boolean(mounted) && me.enableShortcuts);

                if (!mounted && me.isOpen && (!me.windowId || !value.windowId || me.windowId === value.windowId)) {
                    me.#suppressHideFocusReturn = true;
                    try { me.hide(false) } finally { me.#suppressHideFocusReturn = false }
                }
            });

            observe('theme', newTheme => {
                if (newTheme && !me.isDestroyed && me.owner === value && newTheme !== me.theme) {
                    me.#themeDerivedFromOwner = true;
                    me.theme                  = newTheme
                }
            });

            observe('windowId', (newWindowId, prevWindowId) => {
                if (me.isDestroyed || me.owner !== value || newWindowId == null) return;
                if (me.windowId == null || me.#windowDerivedFromOwner || me.windowId === prevWindowId) {
                    me.#windowDerivedFromOwner = true;
                    me.#syncOwnerWindowId(newWindowId)
                }
                me.enableShortcuts && value.mounted && me.registerShortcutHost(value, true)
            })
        }

        me.enableShortcuts && value.mounted && me.registerShortcutHost(value, true)
    }

    /** @protected */
    afterSetPlaceholder(value) {
        if (this.queryField) this.queryField.placeholderText = value
    }

    /** @protected */
    afterSetTitle(value, oldValue) {
        super.afterSetTitle(value, oldValue);
        const me = this;
        if (!value) return;

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

    /** @protected */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        const me = this;

        if (!me.#syncingOwnerWindow && oldValue !== undefined && me.owner && value !== me.owner.windowId) {
            me.#windowDerivedFromOwner = false
        }
        if (value == null) return;

        for (const cmp of [me.headerToolbar, ...(me.headers || []), me.queryField, me.actionList, me.emptyState, me.statusComponent, me.legendComponent, me.errorNotice]) {
            if (cmp instanceof Neo.core.Base && !cmp.isDestroyed && cmp.windowId !== value) {
                cmp.windowId = value
            }
        }
    }

    /** @protected */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy?.();

        return ClassSystemUtil.beforeSetInstance(value, Store, {
            autoInitRecords: true,
            filters        : [{module: SearchFilter, fields: SEARCH_FIELDS, fieldText: SEARCH_FIELD_TEXT, ownerRole: SEARCH_OWNER_ROLE, value: ''}],
            keyProperty    : 'id',
            model          : CommandActionModel,
            sorters        : [{direction: 'DESC', property: 'available'}]
        })
    }

    /**
     * @summary Runs {@link #closeAction} (`'hide'` or `'close'`) and returns its completion value.
     * @param {Boolean} [animate=!!this.animateTargetId]
     * @returns {Promise<void>|void}
     */
    closeOrHide(animate = !!this.animateTargetId) {
        return this[this.closeAction](animate)
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

        if (me.totalCommandCount === 0) return me.emptyCommandsTitle;
        if (count === 0) return query ? `No commands matching "${query}".` : me.emptyResultsTitle;

        let availableCount = 0;
        for (let i = 0; i < count; i++) {
            if (me.store.getAt(i)?.available) availableCount++
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
                    action: 'close', cls: ['neo-command-palette-close'], text: me.closeButtonText,
                    vdom  : {'aria-label': 'Close command palette'}
                }),
                ...me.headerConfig?.actionMap
            }
        };
        super.createHeader()
    }

    /**
     * @summary Builds the combobox `TextField`, `CommandPaletteList` (`Navigator`-paired), empty state, and status footer.
     */
    createItems() {
        const me = this;

        if (!me.queryField) {
            const {appName, windowId} = me;

            me.statusComponent = Neo.create(Component, {
                appName, cls: ['neo-command-palette-status'], flex: 1, role: 'status',
                tag: 'p', text: me.statusText, vdom: {tag: 'p', 'aria-live': 'polite'}, windowId
            });

            me.legendComponent = Neo.create(Component, {
                appName, cls: ['neo-command-palette-legend'], flex: 'none',
                tag: 'span', text: me.legendText, vdom: {tag: 'span', 'aria-hidden': 'true'}, windowId
            });

            me.headers = [
                ...(me.headers || []),
                Neo.create(Container, {
                    appName, cls: ['neo-command-palette-footer'], dock: 'bottom', flex: 'none',
                    items: [me.statusComponent, me.legendComponent], layout: {ntype: 'hbox', align: 'center'}, windowId
                })
            ];

            me.queryField = Neo.create(TextField, {
                appName, autoComplete: false, clearable: false, cls: ['neo-command-palette-query-field'],
                emptyValue     : '', flex: 1, hideLabel: true, keys: null,
                listeners      : {change: me.onQueryFieldChange, scope: me},
                placeholderText: me.placeholder, role: 'combobox', spellCheck: false, value: '', windowId
            });

            const searchBar = Neo.create(Container, {
                appName, cls: ['neo-command-palette-header'], flex: 'none', layout: {ntype: 'hbox', align: 'center'}, windowId,
                items: [{
                    module: Component, appName, cls: ['neo-command-palette-search-icon', 'fa', 'fa-magnifying-glass'],
                    flex  : 'none', tag: 'span', vdom: {tag: 'span', 'aria-hidden': 'true'}, windowId
                }, me.queryField]
            });

            me.actionList = Neo.create(CommandPaletteList, {
                appName, flex: 1, store: me.store, windowId,
                listeners: {
                    createItems : me.onListCreateItems, itemClick: me.onListItemClick,
                    itemNavigate: me.onListItemNavigate, scope: me
                },
                navigator: {
                    clickSelector: '[data-command-enter]', eventSource: me.queryField.getInputElId(),
                    windowId, wrap: true
                }
            });

            Object.assign(me.queryField.getInputEl(), {
                'aria-autocomplete': 'list', 'aria-controls': me.actionList.id,
                'aria-expanded'    : 'true', 'aria-label': me.title
            });
            me.actionList.vdom['aria-label'] = me.title;

            me.emptyState = Neo.create(Component, {
                appName, cls: ['neo-command-palette-empty'], flex: 'none', hidden: true, windowId,
                vdom: {
                    cn: [
                        {tag: 'p', cls: ['neo-command-palette-empty-title'],       text: me.emptyResultsTitle},
                        {tag: 'p', cls: ['neo-command-palette-empty-description'], text: me.emptyResultsDescription}
                    ]
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
        const me    = this,
              owner = me.owner;

        ++me.#openGeneration;
        me.#detachOwner(owner);
        me.#clearAllShortcutHosts();

        if (owner && me.parentComponent === owner) me.parentComponent = null;
        me._owner        = null;
        me.returnFocusId = null;

        if (me.mounted) {
            me.modal && me.syncModalMask(me.id, false);
            me.mounted = false
        }
        me._hidden = true;

        if (me.errorNotice && !me.errorNotice.isDestroyed) {
            me.errorNotice.mounted && me.errorNotice.unmount();
            me.errorNotice.destroy();
            me.errorNotice = null
        }

        me.store?.destroy?.();
        me._store = null;

        super.destroy(...args)
    }

    /**
     * @summary Chooses the initial active index after opening or filtering.
     * @returns {Number}
     * @protected
     */
    findDefaultActiveIndex() {
        const store = this.store,
              count = store?.getCount() ?? 0;
        if (count === 0) return -1;
        for (let i = 0; i < count; i++) {
            if (store.getAt(i)?.available) return i
        }
        return 0
    }

    /** @returns {Neo.component.Base|null} */
    getFocusReturnTarget() {
        return null
    }

    /**
     * @summary Returns the {@link Neo.collection.SearchFilter} owned by this palette on {@link #store}.
     * @returns {Neo.collection.SearchFilter|null}
     */
    getSearchFilter() {
        return this.store?.getFilter(null, SEARCH_OWNER_ROLE) || null
    }

    /**
     * @summary Hides the palette via `Neo.dialog.Base#hide` and restores keyboard focus unless suppressed.
     * @param {Boolean} [animate=!!this.animateTargetId]
     * @returns {Promise<String|null>|undefined}
     */
    hide(animate = !!this.animateTargetId) {
        const me = this;
        if (me.hidden && !me.mounted && !me.mountFlight) return;

        const generation      = ++me.#openGeneration,
              fallbackFocusId = me.#activeFallbackFocusId ?? me.fallbackFocusId,
              inFlight        = [me, me.queryField, me.actionList, me.emptyState, me.statusComponent].filter(cmp => cmp?.isVdomUpdating),
              returnFocusId   = me.returnFocusId,
              suppressFocus   = me.#suppressHideFocusReturn,
              windowId        = me.windowId,
              finishHide      = () => {
                  super.hide(animate);
                  if (!suppressFocus && !me.isDestroyed && !me.isOpen && me.#openGeneration === generation) {
                      return me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId, generation)
                  }
              };

        me.activeContext          = null;
        me.#activeFallbackFocusId = null;
        me.returnFocusId          = null;
        me.#returnFocusExplicit   = false;

        return inFlight.length > 0
            ? Promise.all(inFlight.map(cmp => cmp.promiseUpdate().catch(() => {}))).then(finishHide)
            : finishHide()
    }

    /** @protected */
    normalizeCommands(items) {
        return items.map((item, index) => item ? {
            ...item,
            id: item.id != null ? String(item.id) : (item.label ? String(item.label) : `command-${index}`)
        } : item)
    }

    /**
     * @summary Handles opt-in open-shortcut toggle-hide (ignoring auto-repeat) and `Enter` activation.
     * @param {Object} data
     * @returns {Promise<Object>|void}
     * @protected
     */
    onDialogKeyDown(data) {
        const me = this;
        if (!me.isOpen) return;

        if (me.enableShortcuts && CommandPalette.isOpenShortcut(data)) {
            data.cancelBubble = true;
            return !data.repeat ? me.closeOrHide(false) : undefined
        }

        if (data.key === 'Enter' && data.target?.id === me.inputId) {
            data.cancelBubble = true;
            const record = me.activeIndex >= 0 ? me.store?.getAt(me.activeIndex) : null;
            return me.activateRecord(record, {event: data, source: 'keyboard'})
        }
    }

    /** @param {Object} data */
    onFocusEnter(data) {
        super.onFocusEnter(data);
        const relatedId = data?.relatedTarget?.id;
        if (!this.#returnFocusExplicit && relatedId && relatedId !== 'document.body' && !this.#isOwnElementId(relatedId)) {
            this.returnFocusId = relatedId
        }
    }

    /**
     * @summary Toggles the palette when a non-repeated `Ctrl+K`, `Meta+K`, or `F1` fires on `host`.
     * @param {Neo.component.Base} host
     * @param {Object} data
     * @returns {Promise<Neo.dialog.CommandPalette|void>|void}
     * @protected
     */
    onHostKeyDown(host, data) {
        if (!this.enableShortcuts || !CommandPalette.isOpenShortcut(data) || !host || host.isDestroyed) return;

        data.cancelBubble = true;
        if (data.repeat) return;

        const windowId = host.windowId ?? this.windowId,
              originId = data.target?.id && data.target.id !== 'document.body' ? data.target.id : null;

        return this.toggle({
            context      : {host, windowId},
            returnFocusId: originId,
            theme        : host.getTheme?.() ?? this.owner?.getTheme?.() ?? this.theme,
            windowId
        })
    }

    /** @protected */
    onListCreateItems() {
        this.syncNavigatorHighlight()
    }

    /**
     * @summary Activates or refuses the pointer-clicked option record and returns its outcome promise.
     * @param {Object} [data={}]
     * @returns {Promise<Object>}
     * @protected
     */
    onListItemClick({record} = {}) {
        if (!record) return Promise.resolve({executed: false, reason: 'no-selection', record: null, result: undefined});

        const index = this.store.indexOf(record);
        if (index >= 0) {
            this.activeIndex = index;
            this.actionList?.syncActiveSelection(index)
        }
        return this.activateRecord(record, {source: 'pointer'})
    }

    /**
     * @summary Updates {@link #activeIndex}, `aria-selected`, and unavailable-reason announcements on navigation.
     * @param {Object} data
     * @protected
     */
    onListItemNavigate(data) {
        const me     = this,
              record = data?.record || (Neo.isNumber(data?.activeIndex) ? me.store?.getAt(data.activeIndex) : null);
        if (!record) return;

        const nextIndex = me.store.indexOf(record);
        me.actionList?.syncActiveSelection(nextIndex);

        if (me.#refusalRecordId && String(record.id) === me.#refusalRecordId && nextIndex === me.activeIndex) return;

        me.#refusalRecordId = null;
        me.activeIndex      = nextIndex;
        me.setStatusText(!record.available && record.unavailableReason
            ? `${record.label} — unavailable: ${record.unavailableReason}.`
            : me.computeDefaultStatusText()
        )
    }

    /** @protected */
    onQueryFieldChange({value}) {
        if (!this.#syncingQueryField) this.setQuery(value ?? '')
    }

    /**
     * @summary Opens the command palette in the target window using `Neo.dialog.Base#show`, refreshes
     * commands, and resolves once mounted and focused.
     * @param {Object} [options={}]
     * @returns {Promise<Neo.dialog.CommandPalette>}
     */
    async open(options = {}) {
        const me             = this,
              ownerWindowId  = me.owner && !me.owner.isDestroyed ? me.owner.windowId : null,
              targetWindowId = me.#resolveTargetWindowId(options.windowId);

        if (me.mounted && targetWindowId != null && me.windowId != null && targetWindowId !== me.windowId) {
            me.modal && me.syncModalMask(me.id, false);
            await super.unmount()
        }

        me.activeContext = options.context ?? null;

        if (options.returnFocusId !== undefined) {
            me.returnFocusId        = options.returnFocusId ?? null;
            me.#returnFocusExplicit = Boolean(me.returnFocusId)
        } else if (!me.isOpen) {
            me.returnFocusId        = me.#resolveCurrentFocusedId(targetWindowId);
            me.#returnFocusExplicit = false
        }

        me.#activeFallbackFocusId = options.fallbackFocusId !== undefined
            ? options.fallbackFocusId
            : (me.isOpen ? me.#activeFallbackFocusId : null);

        if (targetWindowId !== null && targetWindowId !== me.windowId) {
            options.windowId === undefined && ownerWindowId != null && targetWindowId === ownerWindowId
                ? me.#syncOwnerWindowId(targetWindowId)
                : (me.windowId = targetWindowId)
        }

        const resolvedTheme = options.theme ?? me.owner?.getTheme?.() ?? me.parentComponent?.getTheme?.() ?? me.getTheme?.() ?? null;
        if (resolvedTheme && resolvedTheme !== me.theme) me.theme = resolvedTheme;

        me.#showFromOpen = true;
        try { me.show(false) } finally { me.#showFromOpen = false }

        if (me.mountFlight) await me.mountFlight;
        if (me.actionList?.isVdomUpdating) await me.actionList.promiseUpdate().catch(() => {});

        me.syncNavigatorHighlight();
        me.queryField?.focus(undefined, false, true, 'keyboard');
        return me
    }

    /**
     * @summary Pulls fresh command descriptors from {@link #commandProvider} (or {@link #commands}) into {@link #store}.
     * @param {Object} [options={}]
     * @returns {Number} Filtered record count.
     */
    refreshCommands({preserveQuery = true} = {}) {
        const me            = this,
              silentTargets = !me.mounted
                  ? [me, me.queryField, me.actionList, me.emptyState, me.statusComponent].filter(Boolean)
                  : [];

        silentTargets.forEach(cmp => { cmp.silentVdomUpdate = true });

        try {
            const rawItems = Neo.isFunction(me.commandProvider)
                      ? (me.commandProvider({context: me.activeContext, palette: me, windowId: me.windowId}) || [])
                      : (me.commands || []),
                  items       = me.normalizeCommands(Array.isArray(rawItems) ? rawItems : []),
                  queryFilter = me.getSearchFilter(),
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

            if (queryFilter) queryFilter.value = me.query;
            me.totalCommandCount = items.length;
            me.store.clear();
            items.length > 0 ? me.store.add(items) : me.actionList?.createItems(!me.mounted);

            const preserved = previousId != null ? me.store.get(previousId) : null,
                  nextIndex = preserved ? me.store.indexOf(preserved) : me.findDefaultActiveIndex();

            me.#refusalRecordId = null;
            me.activeIndex      = nextIndex;
            me.actionList?.syncActiveSelection(nextIndex, !me.mounted);
            me.syncPresentation();
            me.mounted && me.syncNavigatorHighlight();

            return me.store.getCount()
        } finally {
            silentTargets.forEach(cmp => {
                cmp.silentVdomUpdate = false;
                cmp.needsVdomUpdate  = false
            })
        }
    }

    /**
     * @summary Attaches or detaches opt-in `Ctrl+K` / `Meta+K` / `F1` shortcut listeners and scoped chords on `host`.
     * @param {Neo.component.Base} host
     * @param {Boolean} [active=Boolean(host?.mounted)]
     */
    registerShortcutHost(host, active = Boolean(host?.mounted)) {
        const me = this;
        if (!host) return;

        const existing = me.#shortcutHosts.get(host),
              chords   = [{key: 'F1'}, {ctrlOrMeta: true, key: 'k'}],
              scopeId  = existing?.scopeId || `${me.id}:${host.id}`;

        if (active && me.enableShortcuts && !host.isDestroyed) {
            if (!existing) {
                const listener = {keydown: data => me.onHostKeyDown(host, data), scope: me, vnodeId: 'document.body'};
                host.addDomListeners?.(listener);
                host.windowId && Neo.main?.DomEvents?.registerPreventDefaultChords?.({chords, scopeId, windowId: host.windowId});
                me.#shortcutHosts.set(host, {listener, scopeId, windowId: host.windowId ?? null})
            } else if (host.windowId && existing.windowId !== host.windowId) {
                existing.windowId && Neo.main?.DomEvents?.unregisterPreventDefaultChords?.({scopeId, windowId: existing.windowId});
                Neo.main?.DomEvents?.registerPreventDefaultChords?.({chords, scopeId, windowId: host.windowId});
                existing.windowId = host.windowId
            }
        } else if (existing) {
            !host.isDestroyed && host.removeDomListeners?.(existing.listener);
            existing.windowId && Neo.main?.DomEvents?.unregisterPreventDefaultChords?.({scopeId: existing.scopeId, windowId: existing.windowId});
            me.#shortcutHosts.delete(host)
        }
    }

    /**
     * @summary Restores keyboard focus to `returnId` when still mounted and visible, else `fallbackId`.
     * @param {String|null} returnId
     * @param {Function|String|null} fallbackId
     * @param {Number|String|null} windowId
     * @param {Number} [expectedGeneration=this.#openGeneration]
     * @returns {Promise<String|null>}
     */
    async restoreOriginFocus(returnId, fallbackId, windowId, expectedGeneration = this.#openGeneration) {
        const me = this;
        if (me.isDestroyed || me.isOpen || me.#openGeneration !== expectedGeneration) return null;

        const resolveFallback = () => Neo.isFunction(fallbackId) ? fallbackId({palette: me, windowId}) : fallbackId;
        let   targetId        = returnId || resolveFallback() || null,
            targetWindowId = windowId;
        if (!targetId) return null;

        if (returnId) {
            const originCmp      = Neo.getComponent(returnId),
                  cmpUnavailable = Boolean(originCmp && (originCmp.isDestroyed || originCmp.hidden));
            let domUnavailable = false;

            if (!cmpUnavailable && Neo.main?.DomAccess?.getBoundingClientRect) {
                const rect = await Neo.main.DomAccess.getBoundingClientRect({id: returnId, windowId: targetWindowId}).catch(() => null);
                if (me.isDestroyed || me.isOpen || me.#openGeneration !== expectedGeneration) return null;
                domUnavailable = !rect || (rect.width <= 0 && rect.height <= 0)
            }

            if (cmpUnavailable || domUnavailable) {
                const fallback = resolveFallback();
                if (!fallback) return null;
                targetId       = fallback;
                targetWindowId = Neo.getComponent(fallback)?.windowId || targetWindowId
            }
        }

        const targetCmp = Neo.getComponent(targetId);
        targetCmp && !targetCmp.isDestroyed && !targetCmp.hidden
            ? targetCmp.focus(targetId)
            : Neo.main?.DomAccess?.focus?.({id: targetId, windowId: targetWindowId});

        return targetId
    }

    /**
     * @summary Filters {@link #store} by `query`, updates the highlighted option, and refreshes status and empty copy.
     * @param {String} query
     */
    setQuery(query) {
        const me          = this,
              normalized  = String(query ?? ''),
              queryFilter = me.getSearchFilter();

        me.query = normalized;
        if (me.queryField && me.queryField.value !== normalized) {
            me.#syncingQueryField = true;
            me.queryField.value   = normalized;
            me.#syncingQueryField = false
        }
        if (queryFilter) queryFilter.value = normalized;

        me.#refusalRecordId = null;
        me.activeIndex      = me.findDefaultActiveIndex();
        me.actionList?.syncActiveSelection(me.activeIndex, !me.mounted);
        me.syncPresentation();
        me.mounted && me.syncNavigatorHighlight();
        me.fire('filter', {count: me.store.getCount(), palette: me, query: normalized})
    }

    /** @protected */
    setStatusText(text, isError = false) {
        this.statusText = text;
        if (this.statusComponent) {
            this.statusComponent.toggleCls('neo-is-error', Boolean(isError));
            this.statusComponent.text = text
        }
    }

    /**
     * @summary Refreshes commands, adopts {@link #owner}'s window and theme, mounts via `Dialog#show`, and syncs `Navigator`.
     * @param {Boolean} [animate=!!this.animateTargetId]
     */
    show(animate = !!this.animateTargetId) {
        const me            = this,
              wasOpen       = me.isOpen,
              owner         = me.owner && !me.owner.isDestroyed ? me.owner : null,
              ownerTheme    = owner?.getTheme?.(),
              ownerWindowId = owner?.windowId ?? null;

        me.#dismissErrorNotice();
        if (!me.#showFromOpen && ownerWindowId != null && (me.windowId == null || me.#windowDerivedFromOwner)) {
            me.#syncOwnerWindowId(ownerWindowId)
        }

        if (!wasOpen) {
            ++me.#openGeneration;
            if (!me.#showFromOpen) {
                me.activeContext          = null;
                me.#activeFallbackFocusId = null;
                me.returnFocusId          = me.#resolveCurrentFocusedId(me.windowId);
                me.#returnFocusExplicit   = false
            }
        }

        if (ownerTheme && ownerTheme !== me.theme) me.theme = ownerTheme;
        me.refreshCommands({preserveQuery: false});
        super.show(animate);

        if (me.mountFlight) {
            me.mountFlight.then(() => { !me.isDestroyed && !me.hidden && me.syncNavigatorHighlight() })
        } else if (me.mounted) {
            me.syncNavigatorHighlight();
            me.queryField?.focus(undefined, false, true, 'keyboard')
        }
    }

    /** @protected */
    syncNavigatorHighlight() {
        const me = this;
        me.actionList?.syncActiveSelection(me.activeIndex, !me.mounted);
        if (!me.mounted || !me.actionList) return;

        const applyHighlight = () => {
            if (me.isDestroyed || !me.mounted || !me.actionList) return;
            if ((me.store?.getCount() ?? 0) === 0 || me.activeIndex < 0) {
                me.inputId && Neo.applyDeltas?.(me.windowId, {attributes: {'aria-activedescendant': null}, id: me.inputId});
                return
            }
            me.actionList._focusIndex = -1;
            me.actionList.focusIndex  = me.activeIndex
        };

        me.actionList.isVdomUpdating
            ? me.actionList.promiseUpdate().then(applyHighlight).catch(() => {})
            : applyHighlight()
    }

    /** @protected */
    syncPresentation() {
        const me    = this,
              count = me.store?.getCount() ?? 0;

        me.setStatusText(me.computeDefaultStatusText());
        me.actionList?.toggleCls('neo-is-empty', count === 0);

        if (me.emptyState) {
            const [titleNode, descNode] = me.emptyState.vdom.cn;
            titleNode.text = me.totalCommandCount === 0 ? me.emptyCommandsTitle : me.emptyResultsTitle;
            descNode.text  = me.totalCommandCount === 0 ? me.emptyCommandsDescription : me.emptyResultsDescription;

            if (count === 0) {
                me.emptyState.hidden ? (me.emptyState.hidden = false) : me.emptyState.update()
            } else if (!me.emptyState.hidden) {
                me.emptyState.hidden = true
            }
        }
    }

    /**
     * @summary Hides the palette via {@link #closeOrHide} when already open in the target window, otherwise opens it.
     * @param {Object} [options={}]
     * @returns {Promise<Neo.dialog.CommandPalette|void>}
     */
    async toggle(options = {}) {
        const me             = this,
              targetWindowId = me.#resolveTargetWindowId(options.windowId);

        return me.isOpen && (!targetWindowId || !me.windowId || targetWindowId === me.windowId)
            ? me.closeOrHide(false)
            : me.open(options)
    }

    #clearAllShortcutHosts() {
        for (const host of [...this.#shortcutHosts.keys()]) this.registerShortcutHost(host, false)
    }

    #detachOwner(owner) {
        if (this.#ownerCleanups.length > 0) this.#ownerCleanups.splice(0).forEach(cleanup => cleanup());
        owner && this.registerShortcutHost(owner, false)
    }

    #dismissErrorNotice() {
        const notice = this.errorNotice;
        ++this.#errorNoticeGeneration;
        if (notice && !notice.isDestroyed && (notice.mounted || !notice.hidden)) {
            notice.mounted ? notice.unmount() : (notice._hidden = true)
        }
    }

    #handleOwnerDestroy(destroyedOwner) {
        const me = this;
        me.#detachOwner(destroyedOwner);
        me._owner = null;
        if (me.parentComponent === destroyedOwner) me.parentComponent = null;
        if (!me.isDestroyed) {
            me.#suppressHideFocusReturn = true;
            me.destroy(true)
        }
    }

    #isOwnElementId(id) {
        if (!id) return false;
        if (id === this.id || id === this.inputId || id === this.closeButtonId || id === this.listboxId || id === this.errorNotice?.id) return true;
        const cmp = Neo.getComponent(id);
        return Boolean(cmp && (cmp === this || cmp.up?.({id: this.id})))
    }

    #reportCommandFailure(record, error, reason, message, {context, event, source, windowId}) {
        const me = this;
        if (me.isDestroyed) return;
        me.#refusalRecordId = String(record.id);
        me.setStatusText(message, true);
        !me.isOpen && me.#showErrorNotice(message, windowId);
        me.fire('commandError', {context, error, event, message, palette: me, reason, record, triggerSource: source, windowId})
    }

    #resolveCommandHandler(handler) {
        const baseScope = this.owner || this;
        if (Neo.isFunction(handler)) return {fn: handler, scope: baseScope};

        if (Neo.isString(handler) && handler.length > 0) {
            let fnName = handler,
                scope  = baseScope;

            if (!scope?.[fnName] && fnName.startsWith('up.')) {
                fnName = fnName.slice(3);
                while (scope && !scope[fnName]) scope = scope.parent
            } else {
                scope = scope?.getController?.()?.getHandlerScope?.(fnName, null) || scope
            }
            if (Neo.isFunction(scope?.[fnName])) return {fn: scope[fnName], scope}
        }

        return {fn: null, scope: null}
    }

    #resolveCurrentFocusedId(windowId = this.windowId) {
        const focusManager = Neo.manager?.Focus,
              latest       = windowId != null ? focusManager?.history?.[windowId]?.[0] : null;
        if (!latest || focusManager?.leftHistoryEntries?.has?.(latest)) return null;
        if (Array.isArray(latest.componentPath) && latest.componentPath.includes(this.id)) return null;

        const leafId = latest.data?.path?.[0]?.id || latest.data?.target?.id || latest.componentPath?.[0] || null;
        return leafId && leafId !== 'document.body' && !this.#isOwnElementId(leafId) ? leafId : null
    }

    #resolveTargetWindowId(explicitWindowId) {
        const ownerWindowId = this.owner && !this.owner.isDestroyed ? this.owner.windowId : null;
        return explicitWindowId
            ?? (this.#windowDerivedFromOwner && ownerWindowId != null ? ownerWindowId : null)
            ?? this.windowId ?? ownerWindowId ?? this.parentComponent?.windowId ?? null
    }

    #showErrorNotice(message, windowId) {
        const me         = this,
              generation = ++me.#errorNoticeGeneration,
              targetWin  = windowId ?? me.windowId;

        if (!me.errorNotice || me.errorNotice.isDestroyed) {
            me.errorNotice = Neo.create(Component, {
                appName  : me.appName, autoInitVnode: false, autoMount: false,
                cls      : ['neo-command-palette-alert'], floating: true, hidden: true,
                listeners: {click: () => me.#dismissErrorNotice(), scope: me},
                parentId : 'document.body', role: 'alert', text: message,
                theme    : me.theme, vdom: {tag: 'div', 'aria-live': 'assertive'}, windowId: targetWin
            })
        } else {
            if (me.errorNotice.mounted && targetWin != null && me.errorNotice.windowId !== targetWin) me.errorNotice.unmount();
            if (me.appName && me.errorNotice.appName !== me.appName) me.errorNotice.appName = me.appName;
            if (me.theme && me.errorNotice.theme !== me.theme) me.errorNotice.theme = me.theme;
            if (targetWin != null && me.errorNotice.windowId !== targetWin) me.errorNotice.windowId = targetWin;
            me.errorNotice.text = message
        }

        delete me.errorNotice.vdom.removeDom;
        me.errorNotice._hidden = false;
        me.errorNotice.mounted ? me.errorNotice.update() : me.errorNotice.initVnode(true);

        if (me.errorDismissDelay > 0 && !Neo.config?.unitTestMode) {
            me.trap(me.timeout(me.errorDismissDelay)).then(() => {
                if (!me.isDestroyed && me.#errorNoticeGeneration === generation) me.#dismissErrorNotice()
            }).catch(() => {})
        }
    }

    #syncOwnerWindowId(nextWindowId) {
        const me = this;
        if (nextWindowId == null || nextWindowId === me.windowId) return;
        if (me.mounted) {
            me.modal && me.syncModalMask(me.id, false);
            super.unmount()
        }
        me.#syncingOwnerWindow = true;
        try { me.windowId = nextWindowId } finally { me.#syncingOwnerWindow = false }
    }
}

export default Neo.setupClass(CommandPalette);
