import Component      from '../component/Base.mjs';
import NeoArray       from '../util/Array.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

/**
 * @summary The default button component for the Neo.mjs framework.
 *
 * This class extends `Neo.component.Base` and offers comprehensive configurations for
 * text, icons, badges, and event handling. It supports advanced features like
 * internal routing, external URL redirection, and optional ripple effects on click.
 * This class serves as the foundation for other specialized button types like
 * SplitButton, TabHeaderButton, and GridHeaderButton.
 *
 * @class Neo.button.Base
 * @extends Neo.component.Base
 * @see Neo.examples.button.base.MainContainer
 */
class Button extends Component {
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
         * Shortcut for domListeners={click:handler}.
         * A string-based value assumes that the handlerFn lives inside a controller.Component.
         *
         * This config uses a custom `isEqual` function to ensure proper reactivity.
         * When the handler is a function, it's often a closure that changes on each render
         * (e.g., in recycled components like grid cells). The default deep comparison
         * (`Neo.isEqual`) would incorrectly treat structurally identical functions as unchanged,
         * preventing updates. The custom `isEqual` forces an update for new function instances,
         * while performing a standard equality check for string-based handlers.
         * @member {Function|String|null} handler_
         * @reactive
         */
        handler_: {
            [isDescriptor]: true,
            value         : null,

            isEqual: (a, b) => {
                if (Neo.isFunction(a) && Neo.isFunction(b)) {
                    return false
                }
                return a === b
            }
        },
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
         * @reactive
         */
        iconCls_: null,
        /**
         * The color to use for an icon, e.g. '#ff0000' [optional]
         * @member {String|null} iconColor_=null
         * @reactive
         */
        iconColor_: null,
        /**
         * The position of the icon in case iconCls has a value.
         * Valid values are: 'top', 'right', 'bottom', 'left'
         * @member {String} iconPosition_='left'
         * @reactive
         */
        iconPosition_: 'left',
        /**
         * An array representing the configuration of the menu items.
         *
         * Or a configuration object which adds custom configuration to the menu to be
         * created and includes an `items` property to define the menu items.
         * @member {Object|Object[]|null} menu_=null
         * @reactive
         */
        menu_: null,
        /**
         * The pressed state of the Button
         * @member {Boolean} pressed_=false
         * @reactive
         */
        pressed_: false,
        /**
         * Change the browser hash value on click.
         * Use route for internal navigation and url for external links. Do not use both on the same instance.
         * Transforms the button tag into an a tag [optional]
         * @member {String|null} route_=null
         * @reactive
         */
        route_: null,
        /**
         * The text displayed on the button [optional]
         * You can either pass a string, or a vdom cn array.
         * @example
         *  text: [{tag: 'span', style: {color: '#bbbbbb'}, text: '●'}, {vtype: 'text', text: ' Cases'}]
         * @member {Object[]|String|null} text=null
         * @reactive
         */
        text: null,
        /**
         * Transforms the button tag into an a tag [optional]
         * @member {String|null} url_=null
         * @reactive
         */
        url_: null,
        /**
         * If url is set, applies the target attribute on the top level vdom node [optional]
         * @member {String} urlTarget_='_blank'
         * @reactive
         */
        urlTarget_: '_blank',
        /**
         * True adds an expanding circle on click
         * @member {Boolean} useRippleEffect_=true
         * @reactive
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
     * @member {Object} rippleWrapper
     */
    get badgeNode() {
        return this.getVdomRoot().cn[2]
    }
    /**
     * @member {Object} rippleWrapper
     */
    get iconNode() {
        return this.getVdomRoot().cn[0]
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
     * @member {Object} rippleWrapper
     */
    get rippleWrapper() {
        return this.getVdomRoot().cn[3]
    }
    /**
     * @member {Object} textNode
     */
    get textNode() {
        return this.getVdomRoot().cn[1]
    }

    /**
     * @param {Object} config The configuration object for the button instance.
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
     * Workaround fix for: https://github.com/neomjs/neo/issues/6659
     * Todo: inspect this further (we do not want to add fixed ids for all child nodes)
     * Triggered after the id config got changed
     * @param {String} value    The new value of the id config.
     * @param {String} oldValue The old value of the id config.
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        this.textNode.id = value + '__text'
    }

    /**
     * Triggered after the badgePosition config got changed
     * @param {String} value    The new value of the badgePosition config.
     * @param {String} oldValue The old value of the badgePosition config.
     * @protected
     */
    afterSetBadgePosition(value, oldValue) {
        let me          = this,
            {badgeNode} = me,
            cls         = badgeNode.cls || [];

        NeoArray.remove(cls, 'neo-' + oldValue);
        NeoArray.add(cls, 'neo-' + value);

        badgeNode.cls = cls;

        me.update()
    }

    /**
     * Triggered after the badgeText config got changed
     * @param {String|null} value    The new value of the badgeText config.
     * @param {String|null} oldValue The old value of the badgeText config.
     * @protected
     */
    afterSetBadgeText(value, oldValue) {
        let {badgeNode} = this;

        badgeNode.removeDom = !Boolean(value);
        badgeNode.text      = value;

        this.update()
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value    The new value of the iconCls config.
     * @param {String} oldValue The old value of the iconCls config.
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        let {iconNode} = this;

        NeoArray.remove(iconNode.cls, oldValue);
        NeoArray.add(   iconNode.cls, value);

        iconNode.removeDom = !value || value === '';
        this.update()
    }

    /**
     * Triggered after the iconColor config got changed
     * @param {String|null} value    The new value of the iconColor config.
     * @param {String|null} oldValue The old value of the iconColor config.
     * @protected
     */
    afterSetIconColor(value, oldValue) {
        let {iconNode} = this;

        if (!iconNode.style) {
            iconNode.style = {};
        }

        if (value === '') {
            value = null
        }

        iconNode.style.color = value;
        this.update()
    }

    /**
     * Triggered after the iconPosition config got changed
     * @param {String} value    The new value of the iconPosition config.
     * @param {String} oldValue The old value of the iconPosition config.
     * @protected
     */
    afterSetIconPosition(value, oldValue) {
        let cls = this.cls;

        NeoArray.remove(cls, 'icon-' + oldValue);
        NeoArray.add(cls, 'icon-' + value);

        this.cls = cls
    }

    /**
     * Triggered after the menu config got changed
     * @param {Object|Object[]|null} value    The new value of the menu config.
     * @param {Object|Object[]|null} oldValue The old value of the menu config.
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
     * Triggered after the pressed config got changed
     * @param {Boolean} value    The new value of the pressed config.
     * @param {Boolean} oldValue The old value of the pressed config.
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let cls = this.cls;

        NeoArray.toggle(cls, 'pressed', value === true);
        this.cls = cls
    }

    /**
     * Triggered after the route config got changed
     * @param {String|null} value    The new value of the route config.
     * @param {String|null} oldValue The old value of the route config.
     * @protected
     */
    afterSetRoute(value, oldValue) {
        !this.editRoute && this.updateTag()
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value    The new value of the theme config.
     * @param {String|null} oldValue The old value of the theme config.
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
     * Triggered after the text config got changed
     * @param {Object[]|String|null} value    The new value of the text config.
     * @param {Object[]|String|null} oldValue The old value of the text config.
     * @protected
     */
    afterSetText(value, oldValue) {
        let me         = this,
            isEmpty    = !value || value === '',
            vdomRoot   = me.getVdomRoot(),
            {textNode} = me;

        NeoArray.toggle(me._cls,      'no-text', isEmpty);
        NeoArray.toggle(vdomRoot.cls, 'no-text', isEmpty);
        textNode.removeDom = isEmpty;

        if (!isEmpty) {
            if (Neo.isArray(value)) {
                textNode.cn = value;
                delete textNode.text
            } else {
                textNode.text = value;
                delete textNode.cn
            }
        }

        me.update()
    }

    /**
     * Triggered after the url config got changed
     * @param {String|null} value    The new value of the url config.
     * @param {String|null} oldValue The old value of the url config.
     * @protected
     */
    afterSetUrl(value, oldValue) {
        this.updateTag()
    }

    /**
     * Triggered after the useRippleEffect config got changed
     * @param {Boolean} value    The new value of the useRippleEffect config.
     * @param {Boolean} oldValue The old value of the useRippleEffect config.
     * @protected
     */
    afterSetUseRippleEffect(value, oldValue) {
        // setting the config to false ends running ripple animations
        this.rippleWrapper.removeDom = true;
        this.update()
    }

    /**
     * Triggered after the urlTarget config got changed
     * @param {String} value    The new value of the urlTarget config.
     * @param {String} oldValue The old value of the urlTarget config.
     * @protected
     */
    afterSetUrlTarget(value, oldValue) {
        let me       = this,
            vdomRoot = me.getVdomRoot();

        if (me.url) {
            vdomRoot.target = value
        } else {
            delete vdomRoot.target
        }

        me.update()
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value    The new value of the windowId config.
     * @param {Number|null} oldValue The old value of the windowId config.
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
     * @param {String} value    The new value of the badgePosition config.
     * @param {String} oldValue The old value of the badgePosition config.
     * @returns {String}
     * @protected
     */
    beforeSetBadgePosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'badgePosition')
    }

    /**
     * Triggered before the iconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value    The new value of the iconCls config.
     * @param {Array|String|null} oldValue The old value of the iconCls config.
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
     * @param {String} value    The new value of the iconPosition config.
     * @param {String} oldValue The old value of the iconPosition config.
     * @protected
     */
    beforeSetIconPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'iconPosition')
    }

    /**
     * Changes the application's route based on the button's route config.
     * @protected
     */
    changeRoute() {
        this.editRoute && Neo.Main.editRoute(this.route)
    }

    /**
     * Destroys the button instance, its menu (if present), and calls the superclass destroy method.
     * @param {...*} args Arguments to pass to the superclass destroy method.
     */
    destroy(...args) {
        this.menuList?.destroy(true, false);
        super.destroy(...args)
    }

    /**
     * Handles the click event on the button.
     * Triggers the configured handler, toggles the menu, updates the route, and shows the ripple effect if applicable.
     * @param {Object} data The click event data object.
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
     * Displays a ripple animation effect on the button.
     * @param {Object} data The click event data object used to calculate the ripple position.
     */
    async showRipple(data) {
        let me                   = this,
            buttonRect           = data.path[0].rect,
            diameter             = Math.max(buttonRect.height, buttonRect.width),
            radius               = diameter / 2,
            rippleEffectDuration = me.rippleEffectDuration,
            {rippleWrapper}      = me,
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
     * Toggles the visibility of the button's menu, if one is configured.
     */
    async toggleMenu() {
        let {menuList} = this,
            hidden     = !menuList.hidden;

        menuList.hidden = hidden;

        if (!hidden) {
            await this.timeout(50)
        }
    }

    /**
     * Serializes the button into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me      = this,
            handler = me.handler;

        return {
            ...super.toJSON(),
            badgePosition: me.badgePosition,
            badgeText    : me.badgeText,
            handler      : Neo.isString(handler) ? handler : (Neo.isFunction(handler) ? 'function' : null),
            iconCls      : me.iconCls,
            iconColor    : me.iconColor,
            iconPosition : me.iconPosition,
            pressed      : me.pressed,
            route        : me.route,
            text         : me.text,
            url          : me.url,
            urlTarget    : me.urlTarget
        }
    }

    /**
     * Updates the VDOM tag of the button (e.g., switching between 'button' and 'a' tags) based on the current configuration.
     */
    updateTag() {
        let me                      = this,
            {editRoute, route, url} = me,
            link                    = !editRoute && route || url,
            vdomRoot                = me.getVdomRoot();

        if (!editRoute && route?.startsWith('#') === false) {
            link = '#' + link
        }

        if (link) {
            vdomRoot.href = link;
            vdomRoot.tag  = 'a'
        } else {
            delete vdomRoot.href;
            vdomRoot.tag = 'button'
        }

        me.update()
    }
}

export default Neo.setupClass(Button);
