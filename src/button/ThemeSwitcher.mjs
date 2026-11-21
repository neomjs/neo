import Button   from './Base.mjs';
import MenuList from '../menu/List.mjs';

const themeLabels = {
    'neo-theme-neo-light': 'Neo Light',
    'neo-theme-neo-dark' : 'Neo Dark',
    'neo-theme-light'    : 'Light',
    'neo-theme-dark'     : 'Dark',
    'neo-theme-cyberpunk': 'Cyberpunk'
};

/**
 * @summary Presents the host's current theme as a radio selection using the standard menu's navigation and dismissal.
 * @class Neo.button.ThemeSwitcherMenu
 * @extends Neo.menu.List
 * @private
 */
class ThemeSwitcherMenu extends MenuList {
    static config = {
        /**
         * @member {String} className='Neo.button.ThemeSwitcherMenu'
         * @protected
         */
        className: 'Neo.button.ThemeSwitcherMenu',
        /**
         * @member {String} role='menu'
         * @protected
         */
        role: 'menu'
    }

    /** @member {Object|null} #pointer=null @private */
    #pointer = null

    /**
     * @summary Keeps the trigger expanded state and the menu's keyboard entry in sync with mounting.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const button = this.parentComponent;

        if (button?.menuList === this) {
            button.syncMenuAria();

            if (value) {
                const record = this.store.get(button.activeTheme) || this.store.getAt(0);

                record && this.focus(this.getItemId(this.getRecordId(record)))
            }
        }
    }

    /**
     * @summary Projects the effective theme independently of transient menu focus.
     * @param {Object} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object|null}
     * @protected
     */
    createItem(record, index, poolIndex=index) {
        const item = super.createItem(record, index, poolIndex);

        if (item) {
            delete item['aria-selected'];
            item.role            = 'menuitemradio';
            item['aria-checked'] = String(record.id === this.parentComponent?.activeTheme)
        }

        return item
    }

    /**
     * @summary Carries the pointer origin through the standard menu's shared pointer/Enter dispatch.
     * @param {Object} node
     * @param {Object} data
     * @protected
     */
    onItemClick(node, data) {
        this.#pointer = data;

        try {
            super.onItemClick(node, data)
        } finally {
            this.#pointer = null
        }
    }

    /**
     * @summary Applies the chosen theme before the standard leaf command closes the menu.
     * @param {String} nodeId
     * @protected
     */
    onKeyDownEnter(nodeId) {
        if (nodeId) {
            const record = this.store.get(this.getItemRecordId(nodeId));

            if (record) {
                this.parentComponent?.selectTheme(record.id, this.#pointer);
                super.onKeyDownEnter(nodeId)
            }
        }
    }
}

Neo.setupClass(ThemeSwitcherMenu);

/**
 * @summary Switches the owning viewport between configured themes, as a toggle for two or a menu for more.
 * @description Reads the viewport's effective theme on boot and follows subsequent theme writes. A circular
 * reveal starts in the viewport's window when motion is allowed. Applying the theme remains independent of
 * whether the window supports the animation.
 * @class Neo.button.ThemeSwitcher
 * @extends Neo.button.Base
 */
class ThemeSwitcher extends Button {
    static config = {
        /**
         * @member {String} className='Neo.button.ThemeSwitcher'
         * @protected
         */
        className: 'Neo.button.ThemeSwitcher',
        /**
         * @member {String} ntype='theme-switcher'
         * @protected
         */
        ntype: 'theme-switcher',
        /**
         * @member {String[]} baseCls=['neo-button','neo-theme-switcher']
         * @protected
         */
        baseCls: ['neo-button', 'neo-theme-switcher'],
        /**
         * Shows the action or current theme beside the icon when space allows.
         * @member {Boolean} showText_=true
         * @reactive
         */
        showText_: true,
        /**
         * Viewport or component to theme, or its component id. Defaults to the nearest viewport.
         * @member {Neo.component.Base|String|null} target_=null
         * @reactive
         */
        target_: null,
        /**
         * Optional ordered subset of the themes configured for the target window.
         * @member {String[]|null} themes_=null
         * @reactive
         */
        themes_: null,
        /**
         * @member {String} ui='ghost'
         * @protected
         */
        ui: 'ghost',
        /**
         * @member {Boolean} useRippleEffect_=false
         * @reactive
         */
        useRippleEffect: false,
        /**
         * Uses the circular reveal when the window and the user's motion preference allow it.
         * @member {Boolean} useViewTransition_=true
         * @reactive
         */
        useViewTransition_: true
    }

    /** @member {String[]} #choices @private */
    #choices = []

    /** @member {Neo.component.Base|null} #host @private */
    #host = null

    /** @member {Function|null} #releaseTheme @private */
    #releaseTheme = null

    /** @member {Number} #request @private */
    #request = 0

    /**
     * @summary Reads the theme currently shown by the target, including its window's boot default.
     * @returns {String|undefined}
     */
    get activeTheme() {
        return this.#host?.getTheme()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && this.bindThemeTarget()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowText(value, oldValue) {
        this.isConstructed && this.syncPresentation()
    }

    /**
     * @param {Neo.component.Base|String|null} value
     * @param {Neo.component.Base|String|null} oldValue
     * @protected
     */
    afterSetTarget(value, oldValue) {
        this.isConstructed && this.bindThemeTarget()
    }

    /**
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetThemes(value, oldValue) {
        this.isConstructed && this.syncPresentation()
    }

    /**
     * @summary Reuses the Button skin corresponding to this subclass's configured UI.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetUi(value, oldValue) {
        super.afterSetUi(value, oldValue);
        this.removeAddCls(oldValue && 'neo-button-' + oldValue, value && 'neo-button-' + value)
    }

    /**
     * @summary Follows the viewport's theme config without adding a second theme writer.
     * @protected
     */
    bindThemeTarget() {
        const host = Neo.isString(this.target) ? Neo.getComponent(this.target) : this.target || this.up('viewport');

        if (host !== this.#host) {
            this.#releaseTheme?.();
            this.#host = host;
            this.#request++;
            this.#releaseTheme = host ? this.observeConfig(host, 'theme', () => this.syncPresentation()) : null
        }

        this.syncPresentation()
    }

    /**
     * @summary Human-readable label for named built-in and custom themes.
     * @param {String} theme
     * @returns {String}
     * @protected
     */
    getThemeLabel(theme) {
        return Object.hasOwn(themeLabels, theme) ? themeLabels[theme]
            : theme.replace(/^neo-theme-/, '').replaceAll('-', ' ').replace(/(^|\s)[a-z]/g, part => part.toUpperCase())
    }

    /**
     * @summary Leaves the standard button in charge of opening the multi-theme menu.
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        if (this.disabled || this.#choices.length < 2) return;

        if (this.#choices.length === 2) {
            this.selectTheme(this.#choices.find(theme => theme !== this.activeTheme), data)
        }

        super.onClick(data)
    }

    /**
     * @summary Resolves a viewport even when the switcher is nested in a toolbar.
     * @protected
     */
    onConstructed() {
        super.onConstructed();
        this.bindThemeTarget()
    }

    /**
     * @summary Applies a supported theme after the owning window captures the old theme for a decorative reveal.
     * @param {String} theme
     * @param {Object|null} [data]
     * @returns {Promise<void>}
     * @protected
     */
    async selectTheme(theme, data) {
        const host     = this.#host,
              previous = this.activeTheme;

        if (!host || !this.#choices.includes(theme) || theme === previous) return;

        const request  = ++this.#request,
              windowId = host.windowId;

        if (this.useViewTransition && !Neo.config.prefersReducedMotion && Neo.main.DomAccess?.startViewTransition) {
            try {
                let x, y;

                if (windowId === this.windowId) {
                    x = data?.clientX;
                    y = data?.clientY;

                    if ((!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) && this.mounted) {
                        const rect = await this.getDomRect();

                        x = rect && rect.left + rect.width / 2;
                        y = rect && rect.top + rect.height / 2
                    }
                }

                if (!this.isDestroyed && !host.isDestroyed && request === this.#request && this.activeTheme === previous) {
                    await Neo.main.DomAccess.startViewTransition({delay: 100, reveal: {x, y}, windowId})
                }
            } catch {
                // Transport and animation failures must leave the interactive theme change available.
            }
        }

        if (!this.isDestroyed && !host.isDestroyed && request === this.#request &&
            this.activeTheme === previous && this.#choices.includes(theme)) {
            host.theme = theme
        }
    }

    /**
     * @summary Reflects the menu's mounted state without treating menu focus as the active theme.
     * @protected
     */
    syncMenuAria() {
        const vdom = this.vdom;

        vdom['aria-haspopup'] = this.menu ? 'menu' : null;
        vdom['aria-expanded'] = this.menu ? String(Boolean(this.menuList?.mounted)) : null;
        vdom['aria-disabled'] = this.#choices.length < 2 ? 'true' : null;
        this.update()
    }

    /**
     * @summary Projects the effective choice onto the trigger and updates menu options only when the list changes.
     * @protected
     */
    syncPresentation() {
        const windowId = this.#host?.windowId ?? this.windowId,
              loaded   = (Neo.windowConfigs?.[windowId] || Neo.config).themes ?? [],
              choices  = this.#host ? [...new Set(this.themes ?? loaded)].filter(theme => loaded.includes(theme)) : [],
              active   = this.activeTheme,
              next     = choices.length === 2 ? choices.find(theme => theme !== active) : null,
              label    = (next || active) ? this.getThemeLabel(next || active) : 'Theme',
              icon     = next?.endsWith('-dark') ? 'moon' : next?.endsWith('-light') ? 'sun' : 'palette';

        if (!Neo.isEqual(choices, this.#choices)) {
            this.#choices = choices;
            this.menu = choices.length > 2 ? {
                module: ThemeSwitcherMenu,
                align : {edgeAlign: 't1-b1', target: this.id},
                cls   : ['neo-theme-switcher-menu'],
                items : choices.map(id => ({id, text: this.getThemeLabel(id)}))
            } : null
        } else {
            this.menuList?.createItems()
        }

        this.set({
            ariaLabel: next ? 'Switch to ' + label : 'Theme: ' + label,
            iconCls  : 'neo-theme-switcher-icon-' + icon,
            text     : this.showText ? label : null
        });
        this.syncMenuAria()
    }
}

export default Neo.setupClass(ThemeSwitcher);
