import Button            from './Base.mjs';
import ThemeSwitcherMenu from '../menu/ThemeSwitcher.mjs';
import {isDescriptor}    from '../core/ConfigSymbols.mjs';

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
         * Display names keyed by theme ID. Custom entries extend the built-in labels per switcher.
         * Declare the theme in the workspace's <code>neo-config.json</code> to make it available.
         * Themes without a label use a name derived from their ID.
         * @example
         * {module: ThemeSwitcher, themeLabels: {'neo-theme-company-dark': 'Company Dark'}}
         * @member {Object} themeLabels_
         * @reactive
         */
        themeLabels_: {
            [isDescriptor]: true,
            merge         : 'shallow',
            value         : {
                'neo-theme-neo-light': 'Neo Light',
                'neo-theme-neo-dark' : 'Neo Dark',
                'neo-theme-light'    : 'Light',
                'neo-theme-dark'     : 'Dark',
                'neo-theme-cyberpunk': 'Cyberpunk'
            }
        },
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
     * @summary Refreshes the button and menu when workspace labels change.
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetThemeLabels(value, oldValue) {
        this.isConstructed && this.syncPresentation()
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
        const me       = this,
              {target} = me,
              host     = Neo.isString(target) ? Neo.getComponent(target) : target || me.up('viewport');

        if (host !== me.#host) {
            me.#releaseTheme?.();
            me.#host = host;
            me.#request++;
            me.#releaseTheme = host ? me.observeConfig(host, 'theme', () => me.syncPresentation()) : null
        }

        me.syncPresentation()
    }

    /**
     * @summary Human-readable label for named built-in and custom themes.
     * @param {String} theme
     * @returns {String}
     * @protected
     */
    getThemeLabel(theme) {
        const {themeLabels} = this;

        return themeLabels && Object.hasOwn(themeLabels, theme) ? themeLabels[theme]
            : theme.replace(/^neo-theme-/, '').replaceAll('-', ' ').replace(/(^|\s)[a-z]/g, part => part.toUpperCase())
    }

    /**
     * @summary Leaves the standard button in charge of opening the multi-theme menu.
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        const me = this;

        if (me.disabled || me.#choices.length < 2) return;

        if (me.#choices.length === 2) {
            me.selectTheme(me.#choices.find(theme => theme !== me.activeTheme), data)
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
        const me       = this,
              host     = me.#host,
              previous = me.activeTheme;

        if (!host || !me.#choices.includes(theme) || theme === previous) return;

        const request  = ++me.#request,
              windowId = host.windowId;

        if (me.useViewTransition && !Neo.config.prefersReducedMotion && Neo.main.DomAccess?.startViewTransition) {
            try {
                let x, y;

                if (windowId === me.windowId) {
                    x = data?.clientX;
                    y = data?.clientY;

                    if ((!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) && me.mounted) {
                        const rect = await me.getDomRect();

                        x = rect && rect.left + rect.width / 2;
                        y = rect && rect.top + rect.height / 2
                    }
                }

                if (!me.isDestroyed && !host.isDestroyed && request === me.#request && me.activeTheme === previous) {
                    await Neo.main.DomAccess.startViewTransition({delay: 100, reveal: {x, y}, windowId})
                }
            } catch {
                // Transport and animation failures must leave the interactive theme change available.
            }
        }

        if (!me.isDestroyed && !host.isDestroyed && request === me.#request &&
            me.activeTheme === previous && me.#choices.includes(theme)) {
            host.theme = theme
        }
    }

    /**
     * @summary Reflects the menu's mounted state without treating menu focus as the active theme.
     * @protected
     */
    syncMenuAria() {
        const me   = this,
              vdom = me.vdom;

        vdom['aria-haspopup'] = me.menu ? 'menu' : null;
        vdom['aria-expanded'] = me.menu ? String(Boolean(me.menuList?.mounted)) : null;
        vdom['aria-disabled'] = me.#choices.length < 2 ? 'true' : null;
        me.update()
    }

    /**
     * @summary Projects the effective choice onto the trigger and rebuilds the menu when its options or labels change.
     * @protected
     */
    syncPresentation() {
        const me        = this,
              windowId  = me.#host?.windowId ?? me.windowId,
              loaded    = (Neo.windowConfigs?.[windowId] || Neo.config).themes ?? [],
              choices   = me.#host ? [...new Set(me.themes ?? loaded)].filter(theme => loaded.includes(theme)) : [],
              active    = me.activeTheme,
              next      = choices.length === 2 ? choices.find(theme => theme !== active) : null,
              label     = (next || active) ? me.getThemeLabel(next || active) : 'Theme',
              icon      = next?.endsWith('-dark') ? 'moon' : next?.endsWith('-light') ? 'sun' : 'palette',
              menuItems = choices.length > 2 ? choices.map(id => ({id, text: me.getThemeLabel(id)})) : null;

        me.#choices = choices;

        if (!Neo.isEqual(menuItems, me.menu?.items ?? null)) {
            me.menu = menuItems ? {
                module: ThemeSwitcherMenu,
                align : {edgeAlign: 't1-b1', target: me.id},
                cls   : ['neo-theme-switcher-menu'],
                items : menuItems
            } : null
        } else {
            me.menuList?.createItems()
        }

        me.set({
            ariaLabel: next ? 'Switch to ' + label : 'Theme: ' + label,
            iconCls  : 'neo-theme-switcher-icon-' + icon,
            text     : me.showText ? label : null
        });
        me.syncMenuAria()
    }
}

export default Neo.setupClass(ThemeSwitcher);
