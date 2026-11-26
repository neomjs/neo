import ClassSystemUtil    from '../util/ClassSystem.mjs';
import CommandActionModel from './model/CommandAction.mjs';
import CommandPaletteList from './CommandPaletteList.mjs';
import Component          from '../component/Base.mjs';
import Container          from '../container/Base.mjs';
import Dialog             from './Base.mjs';
import NeoArray           from '../util/Array.mjs';
import Store              from '../data/Store.mjs';
import TextField          from '../form/field/Text.mjs';
import {resolveCallback}  from '../util/Function.mjs';

/**
 * @summary Reusable modal command palette composed from `Neo.dialog.Base`, `Neo.form.field.Text`,
 * `Neo.dialog.CommandPaletteList` (`Neo.list.Base`), and `Neo.main.addon.Navigator`.
 *
 * Applications import `Neo.dialog.CommandPalette` (`ntype: 'command-palette'`), supply a static
 * {@link #commands} array or dynamic {@link #commandProvider} callback, and call {@link #show},
 * {@link #open}, or {@link #toggle} (or pass {@link #owner} for automatic `Ctrl+K` / `Meta+K` / `F1`
 * shortcut binding). Application permissions, command execution, and domain state remain with the
 * caller while the dialog owns search filtering, `Navigator` option movement, `Escape` and close-button
 * dismissal, polite `role="status"` feedback, window migration, and focus restoration.
 *
 * @example
 *     import CommandPalette from '../../../node_modules/neo.mjs/src/dialog/CommandPalette.mjs';
 *
 *     this.palette ??= Neo.create(CommandPalette, {
 *         owner   : this.component,
 *         commands: [
 *             {id: 'counter:increment', label: 'Increment counter', handler: () => this.onIncrement()},
 *             {id: 'theme:toggle',      label: 'Toggle theme',      handler: () => this.onToggleTheme()}
 *         ]
 *     });
 *     this.palette.show();
 *
 * @class Neo.dialog.CommandPalette
 * @extends Neo.dialog.Base
 */
class CommandPalette extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.dialog.CommandPalette'
         * @protected
         */
        className: 'Neo.dialog.CommandPalette',
        /**
         * @member {String} ntype='command-palette'
         * @protected
         */
        ntype: 'command-palette',
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
         * Keep the dialog instance reusable across open and hide cycles by default.
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * Visible label on the header close button.
         * @member {String} closeButtonText='Esc'
         */
        closeButtonText: 'Esc',
        /**
         * @member {String[]} cls=['neo-command-palette','neo-command-palette-surface']
         */
        cls: ['neo-command-palette', 'neo-command-palette-surface'],
        /**
         * Optional callback `({context, palette, windowId}) => Object[]` evaluated whenever the palette
         * shows or refreshes its commands.
         * @member {Function|null} commandProvider=null
         */
        commandProvider: null,
        /**
         * Command descriptors `{id, label, handler, available?, unavailableReason?, group?, description?, shortcut?, iconCls?, keywords?, managesFocus?}`
         * used when no {@link #commandProvider} is supplied.
         * @member {Object[]} commands_=[]
         * @reactive
         */
        commands_: [],
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
         * Supporting copy when zero commands are registered.
         * @member {String} emptyCommandsDescription='No commands are registered for this view yet.'
         */
        emptyCommandsDescription: 'No commands are registered for this view yet.',
        /**
         * Heading shown when zero commands are registered.
         * @member {String} emptyCommandsTitle='No commands available'
         */
        emptyCommandsTitle: 'No commands available',
        /**
         * Supporting copy when a search query matches zero commands.
         * @member {String} emptyResultsDescription='Try a different command name, group, or keyword.'
         */
        emptyResultsDescription: 'Try a different command name, group, or keyword.',
        /**
         * Heading shown when a search query matches zero commands.
         * @member {String} emptyResultsTitle='No matching commands'
         */
        emptyResultsTitle: 'No matching commands',
        /**
         * Automatically binds `Ctrl+K`, `Meta+K`, and `F1` on {@link #owner} (and registered shortcut hosts)
         * while mounted.
         * @member {Boolean} enableShortcuts_=true
         * @reactive
         */
        enableShortcuts_: true,
        /**
         * Fallback DOM element id or resolver `({palette, windowId}) => String|null` focused when the
         * pre-open focus origin unmounted during command execution.
         * @member {Function|String|null} fallbackFocusId=null
         */
        fallbackFocusId: null,
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
         * Optional owning component (`Viewport`, `Workspace`, etc.) from which `appName`, `windowId`,
         * `theme`, controller callback scope, and mount-scoped keyboard shortcuts are derived.
         * @member {Neo.component.Base|null} owner_=null
         * @reactive
         */
        owner_: null,
        /**
         * @member {String} parentId='document.body'
         */
        parentId: 'document.body',
        /**
         * Placeholder text for the combobox search input.
         * @member {String} placeholder_='Type a command or search...'
         * @reactive
         */
        placeholder_: 'Type a command or search...',
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * @member {String} role='dialog'
         */
        role: 'dialog',
        /**
         * Backing store of {@link Neo.dialog.model.CommandAction} records.
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
         * Upper-third viewport centering preserved by `Neo.dialog.Base#initVnode` across both
         * `.neo-body-viewport` and plain-`<body>` applications.
         * @member {Object} wrapperStyle
         */
        wrapperStyle: {
            left     : '50%',
            top      : 'clamp(1rem, 10vh, 6rem)',
            transform: 'translateX(-50%)'
        }
    }

    /**
     * Child `CommandPaletteList` bound to {@link #store}.
     * @member {Neo.dialog.CommandPaletteList|null} actionList=null
     */
    actionList = null
    /**
     * Consumer context passed to {@link #open} and forwarded to {@link #commandProvider} and handlers.
     * @member {*} activeContext=null
     */
    activeContext = null
    /**
     * Zero-based index of the highlighted record in {@link #store}, or `-1` when empty.
     * @member {Number} activeIndex=-1
     */
    activeIndex = -1
    /**
     * Empty-state child component shown when {@link #store} contains zero visible records.
     * @member {Neo.component.Base|null} emptyState=null
     */
    emptyState = null
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
     * Current filter query text.
     * @member {String} query=''
     */
    query = ''
    /**
     * Origin DOM element id captured before opening so dismissal restores keyboard focus.
     * @member {String|null} returnFocusId=null
     */
    returnFocusId = null
    /**
     * Polite `role="status"` child component announcing counts and unavailable command reasons.
     * @member {Neo.component.Base|null} statusComponent=null
     */
    statusComponent = null
    /**
     * Live polite status text announced by {@link #statusComponent}.
     * @member {String} statusText=''
     */
    statusText = ''
    /**
     * Unfiltered count of commands supplied on the latest {@link #refreshCommands} pass.
     * @member {Number} totalCommandCount=0
     */
    totalCommandCount = 0
    /**
     * Fallback focus resolver overridden per {@link #open} invocation when supplied.
     * @member {Function|String|null} #activeFallbackFocusId=null
     */
    #activeFallbackFocusId = null
    /**
     * Cleanup callback returned by {@link #owner}'s reactive `mounted` `Config#subscribe`.
     * @member {Function|null} #ownerMountedUnsubscribe=null
     */
    #ownerMountedUnsubscribe = null
    /**
     * Cleanup callback returned by {@link #owner}'s reactive `theme` `Config#subscribe`.
     * @member {Function|null} #ownerThemeUnsubscribe=null
     */
    #ownerThemeUnsubscribe = null
    /**
     * Record id whose explicit refusal message is currently displayed in `statusComponent`.
     * @member {String|null} #refusalRecordId=null
     */
    #refusalRecordId = null
    /**
     * Active `document.body` shortcut registrations keyed by host component.
     * @member {Map<Neo.component.Base, {listener: Object, windowId: Number|String|null}>} #shortcutHosts
     */
    #shortcutHosts = new Map()
    /**
     * Suppresses automatic focus restoration inside {@link #hide} when {@link #activateRecord} runs its
     * async command handler first and restores or delegates focus afterwards.
     * @member {Boolean} #suppressHideFocusReturn=false
     */
    #suppressHideFocusReturn = false
    /**
     * Guards re-entrant `queryField` `change` events during programmatic updates.
     * @member {Boolean} #syncingQueryField=false
     */
    #syncingQueryField = false

    /**
     * @summary Checks whether a serialized Neo keyboard event matches the standard command-palette open
     * chord (`Ctrl+K`, `Meta+K`, or `F1`).
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
     * @summary Matches every whitespace-delimited query token case-insensitively against a command
     * record's label, group, description, shortcut, keywords, and unavailable reason.
     * @param {Neo.dialog.model.CommandAction|Object} record
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
    mergeConfig(...args) {
        const config = super.mergeConfig(...args),
              owner  = config.owner;

        if (owner) {
            config.appName         ??= owner.appName;
            config.parentComponent ??= owner;
            config.theme           ??= owner.getTheme?.();
            config.windowId        ??= owner.windowId
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

        me.addDomListeners({
            keydown: me.onDialogKeyDown,
            scope  : me
        });

        if (me.commands?.length > 0 && me.totalCommandCount === 0) {
            me.refreshCommands({preserveQuery: false})
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
     * @param {Neo.dialog.model.CommandAction|null} record
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
            me.fire('unavailableCommand', {
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
              fallbackFocusId = me.#activeFallbackFocusId ?? me.fallbackFocusId,
              managesFocus    = Boolean(record.managesFocus),
              returnFocusId   = me.returnFocusId,
              windowId        = me.windowId;

        me.#suppressHideFocusReturn = true;

        try {
            const closing = me.closeOrHide(false);

            if (closing?.then) {
                await closing
            }
        } finally {
            me.#suppressHideFocusReturn = false
        }

        let result;

        if (record.handler) {
            const resolved = Neo.isFunction(record.handler)
                ? {fn: record.handler, scope: me.owner || me}
                : resolveCallback(record.handler, me.owner || me);

            if (Neo.isFunction(resolved?.fn)) {
                result = await resolved.fn.call(resolved.scope, {
                    context,
                    event,
                    palette: me,
                    record,
                    source,
                    windowId
                })
            }
        }

        if (!me.isDestroyed) {
            me.fire('select', {
                context,
                event,
                palette: me,
                record,
                result,
                source,
                windowId
            })
        }

        if (!managesFocus && !me.isDestroyed) {
            await me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId)
        }

        return {executed: true, reason: null, record, result}
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetCommands(value, oldValue) {
        if (oldValue !== undefined && !this.commandProvider && this.store) {
            this.refreshCommands({preserveQuery: this.isOpen})
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetEnableShortcuts(value, oldValue) {
        if (oldValue !== undefined) {
            if (value && this.owner) {
                this.registerShortcutHost(this.owner, Boolean(this.owner.mounted))
            } else if (!value) {
                this.#clearAllShortcutHosts()
            }
        }
    }

    /**
     * @param {Neo.component.Base|null} value
     * @param {Neo.component.Base|null} oldValue
     * @protected
     */
    afterSetOwner(value, oldValue) {
        const me = this;

        if (me.#ownerMountedUnsubscribe) {
            me.#ownerMountedUnsubscribe();
            me.#ownerMountedUnsubscribe = null
        }

        if (me.#ownerThemeUnsubscribe) {
            me.#ownerThemeUnsubscribe();
            me.#ownerThemeUnsubscribe = null
        }

        if (oldValue) {
            me.registerShortcutHost(oldValue, false)
        }

        if (value && !value.isDestroyed) {
            if (!me.appName && value.appName) {
                me.appName = value.appName
            }

            if (!me.parentComponent) {
                me.parentComponent = value
            }

            if (!me.windowId && value.windowId) {
                me.windowId = value.windowId
            }

            const ownerTheme = value.getTheme?.();

            if (!me.theme && ownerTheme) {
                me.theme = ownerTheme
            }

            const mountedConfig = value.getConfig?.('mounted'),
                  themeConfig   = value.getConfig?.('theme');

            if (mountedConfig?.subscribe) {
                me.#ownerMountedUnsubscribe = mountedConfig.subscribe({
                    id   : me.id,
                    scope: me,
                    fn   : mounted => {
                        if (!me.isDestroyed) {
                            me.registerShortcutHost(value, Boolean(mounted) && me.enableShortcuts)
                        }
                    }
                })
            }

            if (themeConfig?.subscribe) {
                me.#ownerThemeUnsubscribe = themeConfig.subscribe({
                    id   : me.id,
                    scope: me,
                    fn   : newTheme => {
                        if (newTheme && !me.isDestroyed && newTheme !== me.theme) {
                            me.theme = newTheme
                        }
                    }
                })
            }

            if (me.enableShortcuts && value.mounted) {
                me.registerShortcutHost(value, true)
            }
        }
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetPlaceholder(value, oldValue) {
        if (this.queryField) {
            this.queryField.placeholderText = value
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

        if (me.totalCommandCount === 0) {
            return me.emptyCommandsTitle
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
     * @summary Builds the combobox `TextField`, `CommandPaletteList` (`Navigator`-paired), empty state, and status footer.
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
                // Allow Escape and open-shortcut chords to reach the enclosing Dialog's key listeners.
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

            me.actionList = Neo.create(CommandPaletteList, {
                appName  : me.appName,
                flex     : 1,
                listeners: {
                    createItems : me.onListCreateItems,
                    itemClick   : me.onListItemClick,
                    itemNavigate: me.onListItemNavigate,
                    scope       : me
                },
                navigator: {
                    // Handle Enter on the App-worker FIFO queue so rapid filter-then-Enter never races Main's DOM update.
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
        const me = this;

        if (me.#ownerMountedUnsubscribe) {
            me.#ownerMountedUnsubscribe();
            me.#ownerMountedUnsubscribe = null
        }

        if (me.#ownerThemeUnsubscribe) {
            me.#ownerThemeUnsubscribe();
            me.#ownerThemeUnsubscribe = null
        }

        me.#clearAllShortcutHosts();
        me.store?.destroy?.();
        me._store = null;

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
     * @summary Defers focus restoration to {@link #restoreOriginFocus} so fallback resolution when an
     * origin control unmounts and `managesFocus: true` handlers stay deterministic.
     * @returns {Neo.component.Base|null}
     */
    getFocusReturnTarget() {
        return null
    }

    /**
     * @summary Hides the palette via `Neo.dialog.Base#hide` and restores keyboard focus unless suppressed
     * by an in-flight command activation.
     * @param {Boolean} [animate=!!this.animateTargetId]
     * @returns {Promise<String|null>|undefined}
     */
    hide(animate = !!this.animateTargetId) {
        const me = this;

        if (me.hidden && !me.mounted && !me.mountFlight) {
            return
        }

        const fallbackFocusId = me.#activeFallbackFocusId ?? me.fallbackFocusId,
              inFlight        = [me, me.queryField, me.actionList, me.emptyState, me.statusComponent].filter(cmp => cmp?.isVdomUpdating),
              returnFocusId   = me.returnFocusId,
              suppressFocus   = me.#suppressHideFocusReturn,
              windowId        = me.windowId,
              finishHide      = () => {
                  super.hide(animate);

                  if (!suppressFocus && !me.isDestroyed) {
                      return me.restoreOriginFocus(returnFocusId, fallbackFocusId, windowId)
                  }
              };

        me.activeContext          = null;
        me.#activeFallbackFocusId = null;

        if (inFlight.length > 0) {
            return Promise.all(inFlight.map(cmp => cmp.promiseUpdate().catch(() => {}))).then(finishHide)
        }

        return finishHide()
    }

    /**
     * @summary Normalizes caller-supplied command objects so minimal `{label, handler}` entries receive
     * a deterministic `id`.
     * @param {Object[]} items
     * @returns {Object[]}
     * @protected
     */
    normalizeCommands(items) {
        return items.map((item, index) => {
            if (!item) {
                return item
            }

            return {
                ...item,
                id: item.id != null ? String(item.id) : (item.label ? String(item.label) : `command-${index}`)
            }
        })
    }

    /**
     * @summary Handles open-shortcut toggle-hide and FIFO-ordered `Enter` activation against {@link #store}.
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
            me.closeOrHide(false);
            return
        }

        if (data.key === 'Enter' && data.target?.id === me.inputId) {
            data.cancelBubble = true;
            const record = me.activeIndex >= 0 ? me.store?.getAt(me.activeIndex) : null;
            me.activateRecord(record, {event: data, source: 'keyboard'})
        }
    }

    /**
     * @summary Toggles the palette when `Ctrl+K`, `Meta+K`, or `F1` fires on a registered host's `document.body`.
     * @param {Neo.component.Base} host
     * @param {Object} data
     * @protected
     */
    onHostKeyDown(host, data) {
        if (!this.enableShortcuts || !CommandPalette.isOpenShortcut(data) || !host || host.isDestroyed) {
            return
        }

        data.cancelBubble = true;

        const windowId = host.windowId ?? this.windowId,
              originId = data.target?.id && data.target.id !== 'document.body' ? data.target.id : null;

        this.toggle({
            context      : {host, windowId},
            returnFocusId: originId,
            theme        : host.getTheme?.() ?? this.owner?.getTheme?.() ?? this.theme,
            windowId
        })
    }

    /**
     * @summary Synchronizes `Navigator` active highlight once `CommandPaletteList` renders filtered items.
     * @protected
     */
    onListCreateItems() {
        this.syncNavigatorHighlight()
    }

    /**
     * @summary Activates or refuses the pointer-clicked option record.
     * @param {Object} data
     * @param {Neo.dialog.model.CommandAction} data.record
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
     * @param {Neo.dialog.model.CommandAction} [data.record]
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
     * @summary Opens the command palette in the target window using `Neo.dialog.Base#show`, refreshes
     * commands, and resolves once mounted and focused.
     * @param {Object} [options={}]
     * @param {*} [options.context=null]
     * @param {Function|String|null} [options.fallbackFocusId]
     * @param {String|null} [options.returnFocusId]
     * @param {String|null} [options.theme]
     * @param {Number|String|null} [options.windowId]
     * @returns {Promise<Neo.dialog.CommandPalette>}
     */
    async open(options = {}) {
        const me             = this,
              targetWindowId = options.windowId ?? me.windowId ?? me.owner?.windowId ?? me.parentComponent?.windowId ?? null;

        if (me.mounted && targetWindowId && me.windowId && targetWindowId !== me.windowId) {
            await super.unmount()
        }

        me.activeContext = options.context ?? null;

        if (options.returnFocusId !== undefined || !me.isOpen) {
            me.returnFocusId = options.returnFocusId ?? null
        }

        if (options.fallbackFocusId !== undefined) {
            me.#activeFallbackFocusId = options.fallbackFocusId
        } else if (!me.isOpen) {
            me.#activeFallbackFocusId = null
        }

        if (targetWindowId !== null && targetWindowId !== me.windowId) {
            me.windowId = targetWindowId
        }

        const resolvedTheme = options.theme ?? me.owner?.getTheme?.() ?? me.parentComponent?.getTheme?.() ?? me.getTheme?.() ?? null;

        if (resolvedTheme && resolvedTheme !== me.theme) {
            me.theme = resolvedTheme
        }

        me.show(false);

        if (me.mountFlight) {
            await me.mountFlight
        }

        me.syncNavigatorHighlight();
        me.queryField?.focus(undefined, false, true, 'keyboard');

        return me
    }

    /**
     * @summary Pulls fresh command descriptors from {@link #commandProvider} (or {@link #commands}) into {@link #store}.
     * @param {Object} [options={}]
     * @param {Boolean} [options.preserveQuery=true]
     * @returns {Number} Filtered record count.
     */
    refreshCommands({preserveQuery = true} = {}) {
        const me            = this,
              silentTargets = !me.mounted
                  ? [me, me.queryField, me.actionList, me.emptyState, me.statusComponent].filter(Boolean)
                  : [];

        silentTargets.forEach(cmp => {
            cmp.silentVdomUpdate = true
        });

        try {
            const rawItems = Neo.isFunction(me.commandProvider)
                      ? (me.commandProvider({context: me.activeContext, palette: me, windowId: me.windowId}) || [])
                      : (me.commands || []),
                  items       = me.normalizeCommands(Array.isArray(rawItems) ? rawItems : []),
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

            me.totalCommandCount = items.length;
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
        } finally {
            silentTargets.forEach(cmp => {
                cmp.silentVdomUpdate = false;
                cmp.needsVdomUpdate  = false
            })
        }
    }

    /**
     * @summary Attaches or detaches `Ctrl+K` / `Meta+K` / `F1` document-level shortcut listeners on `host`
     * (used automatically for {@link #owner} and optionally for secondary multi-window participants).
     * @param {Neo.component.Base} host
     * @param {Boolean} [active=Boolean(host?.mounted)]
     */
    registerShortcutHost(host, active = Boolean(host?.mounted)) {
        const me = this;

        if (!host) {
            return
        }

        const existing = me.#shortcutHosts.get(host);

        if (active && me.enableShortcuts && !host.isDestroyed) {
            if (!existing) {
                const listener = {
                    keydown: data => me.onHostKeyDown(host, data),
                    scope  : me,
                    vnodeId: 'document.body'
                };
                host.addDomListeners?.(listener);

                if (host.windowId) {
                    Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: host.windowId
                    })
                }

                me.#shortcutHosts.set(host, {listener, windowId: host.windowId ?? null})
            } else if (host.windowId && existing.windowId !== host.windowId) {
                if (existing.windowId) {
                    Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: existing.windowId
                    })
                }

                Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
                    id      : 'document.body',
                    keys    : ['F1'],
                    windowId: host.windowId
                });
                existing.windowId = host.windowId
            }
        } else if (existing) {
            if (!host.isDestroyed) {
                host.removeDomListeners?.(existing.listener)
            }

            if (existing.windowId) {
                Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                    id      : 'document.body',
                    keys    : ['F1'],
                    windowId: existing.windowId
                })
            }

            me.#shortcutHosts.delete(host)
        }
    }

    /**
     * @summary Restores keyboard focus to `returnId` when still mounted and visible, otherwise falls back
     * to `fallbackId` so post-command UI transitions never leave focus on `<body>`.
     * @param {String|null} returnId
     * @param {Function|String|null} fallbackId
     * @param {Number|String|null} windowId
     * @returns {Promise<String|null>}
     */
    async restoreOriginFocus(returnId, fallbackId, windowId) {
        const resolveFallback = () => Neo.isFunction(fallbackId)
            ? fallbackId({palette: this, windowId})
            : fallbackId;

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
     * @summary Filters {@link #store} by `query`, updates the highlighted option, and refreshes status and empty copy.
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
     * @summary Updates {@link #statusText} and synchronizes the polite `role="status"` footer region.
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
     * @summary Refreshes eligible commands, adopts {@link #owner}'s current theme when present, mounts via
     * `Neo.dialog.Base#show`, and synchronizes `Navigator` highlight once mounted.
     * @param {Boolean} [animate=!!this.animateTargetId]
     */
    show(animate = !!this.animateTargetId) {
        const me         = this,
              ownerTheme = me.owner?.getTheme?.();

        if (ownerTheme && ownerTheme !== me.theme) {
            me.theme = ownerTheme
        }

        me.refreshCommands({preserveQuery: false});

        super.show(animate);

        if (me.mountFlight) {
            me.mountFlight.then(() => {
                if (!me.isDestroyed && !me.hidden) {
                    me.syncNavigatorHighlight()
                }
            })
        } else if (me.mounted) {
            me.syncNavigatorHighlight();
            me.queryField?.focus(undefined, false, true, 'keyboard')
        }
    }

    /**
     * @summary Directs `Neo.main.addon.Navigator` (`CommandPaletteList#focusIndex`) to {@link #activeIndex}.
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

            titleNode.text = me.totalCommandCount === 0 ? me.emptyCommandsTitle : me.emptyResultsTitle;
            descNode.text  = me.totalCommandCount === 0 ? me.emptyCommandsDescription : me.emptyResultsDescription;

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
     * @summary Hides the palette via {@link #closeOrHide} when already open in the target window, otherwise opens it.
     * @param {Object} [options={}]
     * @returns {Promise<Neo.dialog.CommandPalette|void>}
     */
    async toggle(options = {}) {
        const me             = this,
              targetWindowId = options.windowId ?? me.windowId ?? me.owner?.windowId ?? me.parentComponent?.windowId ?? null;

        if (me.isOpen && (!targetWindowId || !me.windowId || targetWindowId === me.windowId)) {
            return me.closeOrHide(false)
        }

        return me.open(options)
    }

    /**
     * @summary Releases all active `document.body` shortcut listeners and `'F1'` `preventDefault` registrations.
     */
    #clearAllShortcutHosts() {
        for (const host of [...this.#shortcutHosts.keys()]) {
            this.registerShortcutHost(host, false)
        }
    }
}

export default Neo.setupClass(CommandPalette);
