import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.button.Base
 * @extends Neo.component.Base
 */
class Base extends Component {
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
         * @member {String} className='Neo.button.Base'
         * @protected
         */
        className: 'Neo.button.Base',
        /**
         * @member {String} ntype='button'
         * @protected
         */
        ntype: 'button',
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
         * false calls Neo.Main.setRoute()
         * @member {Boolean} editRoute=true
         */
        editRoute: true,
        /**
         * Shortcut for domListeners={click:handler}
         * A string based value assumes that the handlerFn lives inside a ComponentController
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
         * @member {Object} menuListConfig=null
         */
        menuListConfig: null,
        /**
         * The pressed state of the Button
         * @member {Boolean} pressed_=false
         */
        pressed_: false,
        /**
         * Change the browser hash value on click
         * @member {String|null} route_=null
         */
        route_: null,
        /**
         * The text displayed on the button [optional]
         * @member {String|null} text_=null
         */
        text_: null,
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
        useRippleEffect_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'button', type: 'button', cn: [
            {tag: 'span', cls: ['neo-button-glyph']},
            {tag: 'span', cls: ['neo-button-text']},
            {cls: ['neo-button-badge']},
            {cls: ['neo-button-ripple-wrapper'], cn: [
                {cls: ['neo-button-ripple']}
            ]}
        ]}
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
        })
    }

    /**
     * Triggered after the badgePosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetBadgePosition(value, oldValue) {
        let me        = this,
            badgeNode = me.getBadgeNode(),
            cls       = badgeNode.cls || [];

        NeoArray.remove(cls, 'neo-' + oldValue);
        NeoArray.add(cls, 'neo-' + value);

        badgeNode.cls = cls;

        me.update();
    }

    /**
     * Triggered after the badgeText config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBadgeText(value, oldValue) {
        let badgeNode = this.getBadgeNode();

        badgeNode.html      = value;
        badgeNode.removeDom = !Boolean(value);

        this.update();
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        let iconNode = this.getIconNode();

        NeoArray.remove(iconNode.cls, oldValue);
        NeoArray.add(   iconNode.cls, value);

        iconNode.removeDom = !value || value === '';
        this.update()
    }

    /**
     * Triggered after the iconColor config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetIconColor(value, oldValue) {
        let iconNode = this.getIconNode();

        if (!iconNode.style) {
            iconNode.style = {};
        }

        if (value === '') {
            value = null;
        }

        iconNode.style.color = value;
        this.update()
    }

    /**
     * Triggered after the iconPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconPosition(value, oldValue) {
        let cls = this.cls;

        NeoArray.remove(cls, 'icon-' + oldValue);
        NeoArray.add(cls, 'icon-' + value);

        this.cls = cls;
    }

    /**
     * Triggered after the menu config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetMenu(value, oldValue) {
        if (value) {
            import('../menu/List.mjs').then(module => {
                let me = this,
                    isArray    = Array.isArray(value),
                    items      = isArray ? value : value.items,
                    menuConfig = isArray ? {} : value;

                me.menuList = Neo.create({
                    align          : {
                        edgeAlign : 't0-b0',
                        target    : this.id
                    },
                    ...menuConfig,
                    module         : module.default,
                    appName        : me.appName,
                    displayField   : 'text',
                    floating       : true,
                    hidden         : true,
                    items,
                    parentComponent: me,
                    ...me.menuListConfig
                });
            });
        }
    }

    /**
     * Triggered after the pressed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let cls = this.cls;

        NeoArray.toggle(cls, 'pressed', value === true);
        this.cls = cls;
    }

    /**
     * Triggered after the text config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        let me       = this,
            isEmpty  = !value || value === '',
            vdomRoot = me.getVdomRoot(),
            textNode = vdomRoot.cn[1];

        NeoArray.toggle(me._cls,      'no-text', isEmpty);
        NeoArray.toggle(vdomRoot.cls, 'no-text', isEmpty);
        textNode.removeDom = isEmpty;

        if (!isEmpty) {
            textNode.innerHTML = value
        }

        me.update()
    }

    /**
     * Triggered after the url config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUrl(value, oldValue) {
        let vdomRoot = this.getVdomRoot();

        if (value) {
            vdomRoot.href = value;
            vdomRoot.tag  = 'a';
        } else {
            delete vdomRoot.href;
            vdomRoot.tag = 'button';
        }

        this.update()
    }

    /**
     * Triggered after the useRippleEffect config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseRippleEffect(value, oldValue) {
        // setting the config to false ends running ripple animations
        this.getRippleWrapper().removeDom = true;
        this.update()
    }

    /**
     * Triggered after the urlTarget config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUrlTarget(value, oldValue) {
        let me       = this,
            vdomRoot = me.getVdomRoot();

        if (me.url) {
            vdomRoot.target = value;
        } else {
            delete vdomRoot.target;
        }

        me.update()
    }

    /**
     * Converts the iconCls array into a string on beforeGet
     * @returns {String}
     * @protected
     */
    beforeGetIconCls() {
        let iconCls = this._iconCls;

        if (Array.isArray(iconCls)) {
            return iconCls.join(' ');
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
            value = value.split(' ').filter(Boolean);
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
        let me = this;

        if (me.editRoute) {
            Neo.Main.editRoute(me.route)
        } else {
            Neo.Main.setRoute({value: me.route})
        }
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    getBadgeNode() {
        return this.getVdomRoot().cn[2]
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    getIconNode() {
        return this.getVdomRoot().cn[0]
    }

    /**
     * Convenience shortcut
     * @returns {Object}
     */
    getRippleWrapper() {
        return this.getVdomRoot().cn[3]
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        let me = this;

        me.handler?.call(me.handlerScope || me, data);

        me.menu            && me.toggleMenu();
        me.route           && me.changeRoute();
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
            rippleWrapper        = me.getRippleWrapper(),
            rippleEl             = rippleWrapper.cn[0],
            rippleTimeoutId;

        rippleEl.style = Object.assign(rippleEl.style || {}, {
            animation: 'none',
            left     : `${data.clientX - buttonRect.left - radius}px`,
            height   : `${diameter}px`,
            top      : `${data.clientY - buttonRect.top - radius}px`,
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
        let menuList = this.menuList,
            hidden   = !menuList.hidden;

        if (!hidden) {
            !menuList.rendered && menuList.render(true);
            await this.timeout(50);
            menuList.focus()
        }
        menuList.hidden = hidden;
    }
}

Neo.applyClassConfig(Base);

export default Base;
