import Component from '../component/Base.mjs';
import Effect    from '../core/Effect.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.button.Effect
 * @extends Neo.component.Base
 */
class EffectButton extends Component {
    /**
     * Valid values for badgePosition
     * @member {String[]} badgePositions=['bottom-left','bottom-right','top-left','top-right']
     * @protected
     * @static
     */
    static badgePositions = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
    /**
     * Valid values for iconPosition
     * @member {String[]} iconPositions=['top','right','bottom','left']
     * @protected
     * @static
     */
    static iconPositions = ['top', 'right', 'bottom', 'left']

    static config = {
        /**
         * @member {String} className='Neo.button.Effect'
         * @protected
         */
        className: 'Neo.button.Effect',
        /**
         * @member {String} ntype='effect-button'
         * @protected
         */
        ntype: 'effect-button',
        /**
         * @member {String} badgePosition_='top-right'
         */
        badgePosition_: 'top-right',
        /**
         * @member {String|null} badgeText_=null
         */
        badgeText_: null,
        /**
         * @member {String[]} baseCls=['neo-button']
         */
        baseCls: ['neo-button'],
        /**
         * @member {String[]} cls=[]
         */
        cls: [],
        /**
         * false calls Neo.Main.setRoute()
         * @member {Boolean} editRoute=true
         */
        editRoute: true,
        /**
         * Shortcut for domListeners={click:handler}
         * A string based value assumes that the handlerFn lives inside a controller.Component
         * @member {Function|String|null} handler_=null
         */
        handler_: null,
        /**
         * The scope (this pointer) inside the handler function.
         * Points to the button instance by default.
         * You can use 'this' as a string for convenience reasons
         * @member {Object|String|null} handlerScope=null
         */
        handlerScope: null,
        /**
         * The CSS class to use for an icon, e.g. 'fa fa-home'
         * @member {String|null} [iconCls_=null]
         */
        iconCls_: null,
        /**
         * The color to use for an icon, e.g. '#ff0000' [optional]
         * @member {String|null} iconColor_=null
         */
        iconColor_: null,
        /**
         * The position of the icon in case iconCls has a value.
         * Valid values are: 'top', 'right', 'bottom', 'left'
         * @member {String} iconPosition_='left'
         */
        iconPosition_: 'left',
        /**
         * An array representing the configuration of the menu items.
         *
         * Or a configuration object which adds custom configuration to the menu to be
         * created and includes an `items` property to define the menu items.
         * @member {Object|Object[]|null} menu_=null
         */
        menu_: null,
        /**
         * The pressed state of the Button
         * @member {Boolean} pressed_=false
         */
        pressed_: false,
        /**
         * Change the browser hash value on click.
         * Use route for internal navigation and url for external links. Do not use both on the same instance.
         * Transforms the button tag into an a tag [optional]
         * @member {String|null} route_=null
         */
        route_: null,
        /**
         * @member {String} tag='button'
         */
        tag: 'button',
        /**
         * Transforms the button tag into an a tag [optional]
         * @member {String|null} url_=null
         */
        url_: null,
        /**
         * If url is set, applies the target attribute on the top level vdom node [optional]
         * @member {String} urlTarget_='_blank'
         */
        urlTarget_: '_blank',
        /**
         * True adds an expanding circle on click
         * @member {Boolean} useRippleEffect_=true
         */
        useRippleEffect_: true
    }

    /**
     * Time in ms for the ripple effect when clicking on the button.
     * Only active if useRippleEffect is set to true.
     * @member {Number} rippleEffectDuration=400
     */
    rippleEffectDuration = 400
    /**
     * Internal flag to store the last setTimeout() id for ripple effect remove node callbacks
     * @member {Number} #rippleTimeoutId=null
     * @private
     */
    #rippleTimeoutId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: me.onClick,
            scope: me
        });

        me.createVdomEffect()
    }

    /**
     * @returns {Neo.core.Effect}
     */
    createVdomEffect() {
        return new Effect({fn: () => {
            let me = this;

            // Logic from updateTag()
            let {editRoute, route, url} = me;
            let link = !editRoute && route || url;
            let tag  = 'button';
            let href = null;

            if (!editRoute && route?.startsWith('#') === false) {
                link = '#' + link;
            }

            if (link) {
                href = link;
                tag  = 'a';
            }

            // Logic from afterSetText & afterSetPressed & afterSetIconPosition
            let vdomCls = [];

            vdomCls.push(...me.baseCls, ...me.cls);

            NeoArray.toggle(vdomCls, 'no-text', !me.text);
            NeoArray.toggle(vdomCls, 'pressed', me.pressed);
            vdomCls.push('icon-' + me.iconPosition);

            // Main vdom object
            me._vdom = {
                tag,
                cls: vdomCls,
                href,
                target   : me.url ? me.urlTarget : null,
                type     : tag === 'button' ? 'button' : null,
                cn: [
                    // iconNode from afterSetIconCls & afterSetIconColor
                    {
                        tag      : 'span',
                        cls      : ['neo-button-glyph', ...me._iconCls || []],
                        removeDom: !me.iconCls,
                        style    : {color: me.iconColor || null}
                    },
                    // textNode from afterSetText & afterSetId
                    {
                        tag      : 'span',
                        cls      : ['neo-button-text'],
                        id       : `${me.id}__text`,
                        removeDom: !me.text,
                        text     : me.text
                    },
                    // badgeNode from afterSetBadgeText & afterSetBadgePosition
                    {
                        cls      : ['neo-button-badge', 'neo-' + me.badgePosition],
                        removeDom: !me.badgeText,
                        text     : me.badgeText
                    },
                    // rippleWrapper from afterSetUseRippleEffect
                    {
                        cls      : ['neo-button-ripple-wrapper'],
                        removeDom: !me.useRippleEffect,
                        cn       : [
                            {cls: ['neo-button-ripple']}
                        ]
                    }
                ]
            };

            me.update()
        }})
    }

    /**
     * Triggered after the menu config got changed
     * @param {Object|Object[]|null} value
     * @param {Object|Object[]|null} oldValue
     * @protected
     */
    afterSetMenu(value, oldValue) {
        if (value) {
            import('../menu/List.mjs').then(module => {
                let me            = this,
                    isArray       = Array.isArray(value),
                    items         = isArray ? value : value.items,
                    menuConfig    = isArray ? {} : value,
                    stateProvider = me.getStateProvider(),
                    {appName, theme, windowId} = me,

                    config = Neo.merge({
                        module         : module.default,
                        align          : {edgeAlign: 't0-b0', target: me.id},
                        appName,
                        displayField   : 'text',
                        floating       : true,
                        hidden         : true,
                        parentComponent: me,
                        theme,
                        windowId
                    }, menuConfig);

                if (items) {
                    config.items = items
                }

                if (stateProvider) {
                    config.stateProvider = {parent: stateProvider}
                }

                me.menuList = Neo.create(config)
            })
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        let {menuList} = this;

        if (menuList) {
            menuList.theme = value
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let {menuList} = this;

        if (menuList) {
            menuList.windowId = value
        }
    }

    /**
     * Converts the iconCls array into a string on beforeGet
     * @returns {String}
     * @protected
     */
    beforeGetIconCls() {
        let iconCls = this._iconCls;

        if (Array.isArray(iconCls)) {
            return iconCls.join(' ')
        }

        return iconCls
    }

    /**
     * Triggered before the badgePosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetBadgePosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'badgePosition')
    }

    /**
     * Triggered before the iconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value
     * @param {Array|String|null} oldValue
     * @returns {Array}
     * @protected
     */
    beforeSetIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        return value
    }

    /**
     * Triggered before the iconPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetIconPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'iconPosition')
    }

    /**
     * @protected
     */
    changeRoute() {
        this.editRoute && Neo.Main.editRoute(this.route)
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.menuList?.destroy(true, false);
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        me.bindCallback(me.handler, 'handler', me.handlerScope || me);
        me.handler?.(data);

        me.menu            && me.toggleMenu();
        me.route           && me.changeRoute(); // only relevant for editRoute=true
        me.useRippleEffect && me.showRipple(data)
    }

    /**
     * @param {Object} data
     */
    async showRipple(data) {
        let me                   = this,
            buttonRect           = data.path[0].rect,
            diameter             = Math.max(buttonRect.height, buttonRect.width),
            radius               = diameter / 2,
            rippleEffectDuration = me.rippleEffectDuration,
            rippleWrapper        = me.getVdomRoot().cn[3],
            rippleEl             = rippleWrapper.cn[0],
            rippleTimeoutId;

        rippleEl.style = Object.assign(rippleEl.style || {}, {
            animation: 'none',
            height   : `${diameter}px`,
            left     : `${data.clientX - buttonRect.left - radius}px`,
            top      : `${data.clientY - buttonRect.top  - radius}px`,
            width    : `${diameter}px`
        });

        delete rippleWrapper.removeDom;
        me.update();

        await me.timeout(1);

        rippleEl.style.animation = `ripple ${rippleEffectDuration}ms linear`;
        me.update();

        me.#rippleTimeoutId = rippleTimeoutId = setTimeout(() => {
            // we do not want to break animations when clicking multiple times
            if (me.#rippleTimeoutId === rippleTimeoutId) {
                me.#rippleTimeoutId = null;

                rippleWrapper.removeDom = true;
                me.update()
            }
        }, rippleEffectDuration)
    }

    /**
     *
     */
    async toggleMenu() {
        let {menuList} = this,
            hidden     = !menuList.hidden;

        menuList.hidden = hidden;

        if (!hidden) {
            await this.timeout(50)
        }
    }
}

export default Neo.setupClass(EffectButton);
