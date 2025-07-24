import FunctionalBase from '../../functional/component/Base.mjs';
import NeoArray       from '../../util/Array.mjs';

/**
 * @class Neo.functional.button.Base
 * @extends Neo.functional.component.Base
 */
class Button extends FunctionalBase {
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
    static iconPositions  = ['top', 'right', 'bottom', 'left']

    static config = {
        /**
         * @member {String} className='Neo.functional.button.Base'
         * @protected
         */
        className: 'Neo.functional.button.Base',
        /**
         * @member {String} ntype='functional-button'
         * @protected
         */
        ntype: 'functional-button',
        /**
         * @member {String} badgePosition_='top-right'
         * @reactive
         */
        badgePosition_: 'top-right',
        /**
         * @member {String|null} badgeText_=null
         * @reactive
         */
        badgeText_: null,
        /**
         * @member {String[]} baseCls=['neo-button']
         */
        baseCls: ['neo-button'],
        /**
         * false calls Neo.Main.setRoute()
         * @member {Boolean} editRoute=true
         */
        editRoute: true,
        /**
         * @member {Function|String|null} handler_=null
         * @reactive
         */
        handler_: null,
        /**
         * @member {Object|String|null} handlerScope=null
         */
        handlerScope: null,
        /**
         * @member {String[]|null} [iconCls_=null]
         * @reactive
         */
        iconCls_: null,
        /**
         * @member {String|null} iconColor_=null
         * @reactive
         */
        iconColor_: null,
        /**
         * @member {String} iconPosition_='left'
         * @reactive
         */
        iconPosition_: 'left',
        /**
         * @member {Object|Object[]|null} menu_=null
         * @reactive
         */
        menu_: null,
        /**
         * @member {Boolean} pressed_=false
         * @reactive
         */
        pressed_: false,
        /**
         * Internal state for managing the ripple effect animations.
         * Each object in the array requires a unique `id`.
         * @member {Array} ripples_=[]
         * @protected
         * @reactive
         */
        ripples_: [],
        /**
         * @member {String|null} route_=null
         * @reactive
         */
        route_: null,
        /**
         * @member {String} tag='button'
         * @reactive
         */
        tag: 'button',
        /**
         * @member {String|null} text_=null
         * @reactive
         */
        text_: null,
        /**
         * @member {String|null} url_=null
         * @reactive
         */
        url_: null,
        /**
         * @member {String} urlTarget_='_blank'
         * @reactive
         */
        urlTarget_: '_blank',
        /**
         * @member {Boolean} useRippleEffect_=true
         * @reactive
         */
        useRippleEffect_: true
    }

    /**
     * @member {Number} rippleEffectDuration=400
     */
    rippleEffectDuration = 400
    /**
     * @member {Number|null} rippleCleanupTimeout=null
     * @protected
     */
    rippleCleanupTimeout = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: me.onClick,
            scope: me
        })
    }

    /**
     * The single source of truth for the button's VDOM.
     * This method is automatically re-run when any of its dependent configs change.
     * @param {Object} config The component's config object (this instance).
     * @param {Object} data The hierarchical data from state.Provider.
     * @returns {Object}
     */
    createVdom(config, data) {
        const me = this,
              {
                  badgePosition, badgeText, cls, editRoute, iconCls, iconColor, iconPosition,
                  pressed, ripples, route, style, tag, text, url, urlTarget, useRippleEffect
              }  = config;

        const vdomCls = [...me.baseCls, ...cls || []];
        NeoArray.toggle(vdomCls, 'no-text', !text);
        NeoArray.toggle(vdomCls, 'pressed', pressed);
        vdomCls.push('icon-' + iconPosition);

        const link     = !editRoute && route || url;
        const finalTag = link ? 'a' : tag;

        return {
            tag   : finalTag,
            cls   : vdomCls,
            style,
            href  : link ? (link.startsWith('#') ? link : '#' + link) : null,
            target: url ? urlTarget : null,
            type  : finalTag === 'button' ? 'button' : null,
            cn    : [
                // iconNode
                {
                    tag      : 'span',
                    cls      : ['neo-button-glyph', ...iconCls || []],
                    removeDom: !iconCls,
                    style    : {color: iconColor || null}
                },
                // textNode
                {
                    tag      : 'span',
                    cls      : ['neo-button-text'],
                    removeDom: !text,
                    text
                },
                // badgeNode
                {
                    tag      : 'span',
                    cls      : ['neo-button-badge', 'neo-' + badgePosition],
                    removeDom: !badgeText,
                    text     : badgeText
                },
                // rippleWrapper
                {
                    cls      : ['neo-button-ripple-wrapper'],
                    removeDom: !(useRippleEffect && ripples.length > 0),
                    cn       : ripples.map(ripple => ({
                        cls  : ['neo-button-ripple'],
                        id   : ripple.id,
                        style: {
                            animation: `ripple ${me.rippleEffectDuration}ms linear`,
                            height   : `${ripple.diameter}px`,
                            left     : `${ripple.left}px`,
                            top      : `${ripple.top}px`,
                            width    : `${ripple.diameter}px`
                        }
                    }))
                }
            ]
        }
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        me.bindCallback(me.handler, 'handler', me.handlerScope || me);
        me.handler?.(data);

        me.menu && me.toggleMenu();
        me.route && me.changeRoute();

        if (me.useRippleEffect) {
            const buttonRect = data.path[0].rect;
            const diameter   = Math.max(buttonRect.height, buttonRect.width);
            const radius     = diameter / 2;
            const rippleId   = Neo.getId('ripple');

            // Add a new ripple to the state
            me.ripples = [...me.ripples, {
                id  : rippleId,
                diameter,
                left: data.clientX - buttonRect.left - radius,
                top : data.clientY - buttonRect.top - radius
            }];

            // Clear any previously scheduled cleanup to ensure only the last
            // click's timer will execute the cleanup.
            clearTimeout(me.rippleCleanupTimeout);

            // Schedule the cleanup for the entire ripples array.
            me.rippleCleanupTimeout = me.timeout(me.rippleEffectDuration).then(() => {
                me.ripples = [];
            });
        }
    }

    /**
     * Triggered after the menu config got changed
     * @param {Object|Object[]|null} value
     * @param {Object|Object[]|null} oldValue
     * @protected
     */
    afterSetMenu(value, oldValue) {
        const me = this;

        if (value) {
            // Ensure menuList is destroyed before creating a new one
            me.menuList?.destroy(true, false);
            me.menuList = null;

            import('../../menu/List.mjs').then(module => {
                const isArray                    = Array.isArray(value),
                      items                      = isArray ? value : value.items,
                      menuConfig                 = isArray ? {} : value,
                      stateProvider              = me.getStateProvider(),
                      {appName, theme, windowId} = me,

                      config                     = Neo.merge({
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
        } else if (me.menuList) {
            me.menuList.destroy(true, false);
            me.menuList = null;
        }
    }

    /**
     * Triggered before the badgePosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetBadgePosition(value, oldValue) {
        // Using `this.constructor.badgePositions` is superior to `Button.badgePositions` for future class extensions
        return this.beforeSetEnumValue(value, oldValue, 'badgePosition', this.constructor.badgePositions)
    }

    /**
     * Triggered before the iconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value
     * @param {Array|String|null} oldValue
     * @returns {Array|null}
     * @protected
     */
    beforeSetIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            return value.split(' ').filter(Boolean)
        }

        return value || null
    }

    /**
     * Triggered before the iconPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetIconPosition(value, oldValue) {
        // Using `this.constructor.iconPositions` is superior to `Button.iconPositions` for future class extensions
        return this.beforeSetEnumValue(value, oldValue, 'iconPosition', this.constructor.iconPositions)
    }

    /**
     * @protected
     */
    changeRoute() {
        const me = this;
        me.editRoute && Neo.Main.editRoute(me.route)
    }

    /**
     * @param args
     */
    destroy(...args) {
        const me = this;

        clearTimeout(me.rippleCleanupTimeout);
        me.menuList?.destroy(true, false);
        super.destroy(...args)
    }

    /**
     *
     */
    async toggleMenu() {
        const me       = this;
        let {menuList} = me,
            hidden     = !menuList?.hidden;

        if (menuList) {
            menuList.hidden = hidden;

            if (!hidden) {
                await me.timeout(50)
            }
        }
    }
}

export default Neo.setupClass(Button);
