import Abstract         from './Abstract.mjs';
import ClassSystemUtil  from '../util/ClassSystem.mjs';
import ComponentManager from '../manager/Component.mjs';
import KeyNavigation    from '../util/KeyNavigation.mjs';
import Logger           from '../util/Logger.mjs';
import NeoArray         from '../util/Array.mjs';
import Rectangle        from '../util/Rectangle.mjs';
import Style            from '../util/Style.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VNodeUtil        from '../util/VNode.mjs';
import {isDescriptor}   from '../core/ConfigSymbols.mjs';

const
    addUnits          = value => value == null ? value : isNaN(value) ? value : `${value}px`,
    closestController = Symbol.for('closestController'),
    {currentWorker}   = Neo,
    lengthRE          = /^\d+\w+$/;

/**
 * Base class for all Components which have a DOM representation
 * @class Neo.component.Base
 * @extends Neo.component.Abstract
 */
class Component extends Abstract {
    /**
     * Valid values for hideMode
     * @member {String[]} hideModes=['removeDom','visibility']
     * @protected
     * @static
     */
    static hideModes = ['removeDom', 'visibility']

    static config = {
        /**
         * @member {String} className='Neo.component.Base'
         * @protected
         */
        className: 'Neo.component.Base',
        /**
         * @member {String} ntype='component'
         * @protected
         */
        ntype: 'component',
        /**
         * The default alignment specification to position this Component relative to some other
         * Component, or Element or Rectangle. Only applies in case floating = true.
         * @member {Object|String} align_={[isDescriptor]: true, merge: 'deep', value: {edgeAlign: 't-b',constrainTo: 'document.body'}}
         * @reactive
         */
        align_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value: {
                edgeAlign  : 't-b',
                constrainTo: 'document.body'
            }
        },
        /**
         * CSS selectors to apply to the root level node of this component
         * @member {String[]} baseCls=[]
         */
        baseCls: [],
        /**
         * manager.Focus will change this flag on focusin & out dom events
         * @member {Boolean} containsFocus_=false
         * @protected
         * @reactive
         */
        containsFocus_: false,
        /**
         * Assign a component controller to this component (pass an imported module or the string based class name)
         * @member {Neo.controller.Component|String} controller_=null
         * @reactive
         */
        controller_: null,
        /**
         * Set this config to true to dynamically import a DropZone module & create an instance
         * @member {Boolean} droppable_=false
         * @reactive
         */
        droppable_: false,
        /**
         * @member {Neo.draggable.DropZone|null} dropZone=null
         */
        dropZone: null,
        /**
         * @member {Object} dropZoneConfig=null
         */
        dropZoneConfig: null,
        /**
         * True to render this component into the viewport outside of the document flow
         * @member {Boolean} floating
         */
        floating: false,
        /**
         * Internal flag which will get set to true on mount
         * @member {Boolean} hasBeenMounted=false
         * @protected
         */
        hasBeenMounted: false,
        /**
         * Shortcut for style.height, defaults to px
         * @member {Number|String|null} height_=null
         * @reactive
         */
        height_: null,
        /**
         * Initial setting to hide or show the component and
         * you can use either hide()/show() or change this config directly to change the hidden state
         * @member {Boolean} hidden_=false
         * @reactive
         */
        hidden_: false,
        /**
         * Used for hide and show and defines if the component
         * should use css visibility:'hidden' or vdom:removeDom
         * @member {String} hideMode_='removeDom'
         * @reactive
         */
        hideMode_: 'removeDom',
        /**
         * The top level innerHTML of the component
         * @member {String|null} html_=null
         * @reactive
         */
        html_: null,
        /**
         * Set to `true` to show a spinner centered in the component.
         * Set to a string to show a message next to a spinner centered in the component.
         * @member {Boolean|String} isLoading=false
         */
        isLoading_: false,
        /**
         * Using the keys config will create an instance of Neo.util.KeyNavigation.
         * @see {@link Neo.util.KeyNavigation KeyNavigation}
         * @member {Object} keys_=null
         * @reactive
         */
        keys_: null,
        /**
         * Gets used inside afterSetIsLoading() to define the CSS for the loading spinner icon
         * @member {String[]} loadingSpinnerCls_=['fa','fa-spinner','fa-spin']
         * @reactive
         */
        loadingSpinnerCls_: ['fa', 'fa-spinner', 'fa-spin'],
        /**
         * Shortcut for style.maxHeight, defaults to px
         * @member {Number|String|null} maxHeight_=null
         * @reactive
         */
        maxHeight_: null,
        /**
         * Shortcut for style.maxWidth, defaults to px
         * @member {Number|String|null} maxWidth_=null
         * @reactive
         */
        maxWidth_: null,
        /**
         * Shortcut for style.minHeight, defaults to px
         * @member {Number|String|null} minHeight_=null
         * @reactive
         */
        minHeight_: null,
        /**
         * Shortcut for style.minWidth, defaults to px
         * @member {Number|String|null} minWidth_=null
         * @reactive
         */
        minWidth_: null,
        /**
         * Array of Plugin Modules and / or config objects
         * @member {Array|null} plugins_=null
         * @protected
         * @reactive
         */
        plugins_: null,
        /**
         * Set a reference for accessing the component inside view controllers.
         * References will also get mapped into the vdom root (data-ref: value).
         * @member {String|null} reference_=null
         * @protected
         * @reactive
         */
        reference_: null,
        /**
         * Make the view Responsive by adding alternative configs.
         * The definition happens via responsiveCfg
         * @member {Object} responsive=null
         * @protected
         */
        responsive_: null,
        /**
         * Specify a role tag attribute for the vdom root.
         * See: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles
         * @member {String|null} role_=null
         * @reactive
         */
        role_: null,
        /**
         * Set this to true for style 'overflow:auto'.
         * Set this to 'x' or 'y' to add style 'overflow-x' or 'overflow-y' to 'auto'
         * Other than false this will add cls 'neo-scrollable'.
         * @member {Boolean|"x"|"y"} scrollable_=false
         * @reactive
         */
        scrollable_: false,
        /**
         * Style attributes added to this vdom root. see: getVdomRoot()
         * @member {Object} style={[isDescriptor]: true, merge: 'shallow', value: null}
         */
        style_: {
            [isDescriptor]: true,
            merge         : 'shallow',
            value         : null
        },
        /**
         * You can pass a used theme directly to any component,
         * to style specific component trees differently from your main view.
         * @member {String|null} theme_=null
         * @reactive
         */
        theme_: null,
        /**
         * While it is recommended to define tags inside the vdom of classes,
         * this shortcut enables us to change the vdom root tag on instance level.
         * Use cases: switch a Toolbar to a "nav" tag, switch a SideNav to an "aside" tag.
         * @member {String|null} tag_=null
         * @reactive
         */
        tag_: null,
        /**
         * The top level textContent of the component
         * @member {String|null} text_=null
         * @reactive
         */
        text_: null,
        /**
         * Add tooltip config object or a string containing the display text
         * See tooltip/Base.mjs
         *
         * By default, a single, shared Tooltip instance is used for all widgets which request
         * a tooltip. It reconfigures itself from the widget's definition just before showing.
         *
         * If a widget needs its own instance for any reason, inslude the property `ownInstance : true`
         * in the tooltip config object.
         * @member {Object|String} tooltip_=null
         * @reactive
         */
        tooltip_: null,
        /**
         * Add 'primary' and other attributes to make it an outstanding design
         * @member {String|null} ui_=null
         * @reactive
         */
        ui_: null,
        /**
         * Shortcut for style.width, defaults to px
         * @member {Number|String|null} width_=null
         * @reactive
         */
        width_: null,
        /**
         * @member {String[]|null} wrapperCls_=null
         * @reactive
         */
        wrapperCls_: null,
        /**
         * Top level style attributes. Useful in case getVdomRoot() does not point to the top level DOM node.
         * @member {Object|null} wrapperStyle_={[isDescriptor]: true, merge: 'shallow', value: null}
         * @reactive
         */
        wrapperStyle_: {
            [isDescriptor]: true,
            merge         : 'shallow',
            value         : null
        },
        /**
         * The vdom markup for this component.
         * @member {Object} _vdom={}
         */
        _vdom: {}
    }

    /**
     * Returns true if this Component is fully visible, that is it is not hidden and has no hidden ancestors
     */
    get isVisible() {
        return this.mounted && !this.hidden && (!this.parent || this.parent.isVisible);
    }

    /**
     * True after the component render() method was called. Also fires the rendered event.
     * @member {Boolean} rendered=false
     * @protected
     */
    get rendered() {
        return this._rendered || false
    }
    set rendered(value) {
        let me = this;

        me._rendered = value;

        if (value === true) {
            me.fire('rendered', me.id)
        }
    }

    /**
     * The setter will handle vdom updates automatically
     * @member {Object} vdom=this._vdom
     */
    get vdom() {
        return this._vdom
    }
    set vdom(value) {
        this.afterSetVdom(value, value)
    }

    /**
     * Add a new cls to the vdomRoot
     * @param {String} value
     */
    addCls(value) {
        let {cls} = this;

        NeoArray.add(cls, value);
        this.cls = cls
    }



    /**
     * Either a string like 'color: red; background-color: blue;'
     * or an object containing style attributes
     * @param {String|Object} value
     * @returns {Object} all styles of this.el
     */
    addStyle(value) {
        if (Neo.isString(value)) {
            value =  Neo.createStyleObject(value)
        }

        // todo: add a check if something has changed

        return this.style = Object.assign(this.style, value)
    }

    /**
     * Add a new wrapperCls to the top level node
     * @param {String} value
     */
    addWrapperCls(value) {
        let {wrapperCls} = this;

        NeoArray.add(wrapperCls, value);
        this.wrapperCls = wrapperCls
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {

    }

    /**
     * Triggered after the cls config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetCls(value, oldValue) {
        oldValue = oldValue || [];

        let me       = this,
            vdom     = me.vdom,
            vdomRoot = me.getVdomRoot(),
            cls;

        if (vdom !== vdomRoot) {
            // we are using a wrapper node
            vdomRoot.cls = [...value]
        } else {
            // we need to merge changes
            cls = NeoArray.union(me.wrapperCls, value);
            NeoArray.remove(cls, NeoArray.difference(oldValue, value));
            vdom.cls = cls
        }

        me.update()
    }

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        let cls = this.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-disabled');
        this.cls = cls
    }



    /**
     * Triggered after the droppable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDroppable(value, oldValue) {
        let me = this;

        if (value && !me.dropZone) {
            import('../draggable/DropZone.mjs').then(module => {
                me.dropZone = Neo.create({
                    module  : module.default,
                    appName : me.appName,
                    owner   : me,
                    windowId: me.windowId,
                    ...me.dropZoneConfig
                })
            })
        }
    }

    /**
     * Triggered after the height config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetHeight(value, oldValue) {
        this.configuredHeight = addUnits(value);
        this.changeVdomRootKey('height', value)
    }

    /**
     * Triggered after the hidden config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHidden(value, oldValue) {
        let me    = this,
            state = value ? 'hide' : 'show';

        if (value && oldValue === undefined && me.hideMode === 'removeDom') {
            me.vdom.removeDom = true
        } else if (value || oldValue !== undefined) {
            me[state]()
        }

        if (!value) {
            me.revertFocus();
        }

        me.fire(state, {id: me.id});
        me.fire('hiddenChange', {id: me.id, oldValue, value})
    }

    /**
     * Triggered after the html config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHtml(value, oldValue) {
        this.changeVdomRootKey('html', value)
    }

    /**
     * Triggered after the id config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);
        this.changeVdomRootKey('id', value)
    }

    /**
     * Triggered after the isLoading config got changed
     * @param {Boolean|String} value
     * @param {Boolean|String} oldValue
     * @protected
     */
    afterSetIsLoading(value, oldValue) {
        if (value || oldValue !== undefined) {
            let me                 = this,
                {wrapperCls, vdom} = me,
                maskIndex;

            if (oldValue !== undefined && vdom.cn) {
                maskIndex = vdom.cn.findLastIndex(c => c.cls?.includes('neo-load-mask'));

                // Remove the load mask
                if (maskIndex !== -1) {
                    vdom.cn.splice(maskIndex, 1)
                }
            }

            if (value) {
                if (!vdom.cn) {
                    vdom.cn = []
                }

                vdom.cn.push(me.createLoadingMask(value))
            }

            NeoArray.toggle(wrapperCls, 'neo-masked', value);
            me.set({vdom, wrapperCls})
        }
    }

    /**
     * Triggered after the maxHeight config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMaxHeight(value, oldValue) {
        this.configuredMaxHeight = addUnits(value);
        this.changeVdomRootKey('maxHeight', value)
    }

    /**
     * Triggered after the maxWidth config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMaxWidth(value, oldValue) {
        this.configuredMaxWidth = addUnits(value);
        this.changeVdomRootKey('maxWidth', value)
    }

    /**
     * Triggered after the minHeight config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMinHeight(value, oldValue) {
        this.configuredMinHeight = addUnits(value);
        this.changeVdomRootKey('minHeight', value)
    }

    /**
     * Triggered after the minWidth config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMinWidth(value, oldValue) {
        this.configuredMinWidth = addUnits(value);
        this.changeVdomRootKey('minWidth', value)
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (oldValue !== undefined) {
            let me = this;

            if (value) { // mount
                me.hasBeenMounted = true;

                if (me.floating) {
                    me.alignTo();

                    // Focus will be pushed into the first input field or other focusable item
                    me.focus(me.id, true)
                }

                me.fire('mounted', me.id);
            } else { // unmount
                me.revertFocus()
            }
        }
    }

    /**
     * Triggered after the reference config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetReference(value, oldValue) {
        value && this.changeVdomRootKey('data-ref', value)
    }

    /**
     * Triggered after the responsive config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    async afterSetResponsive(value, oldValue) {
        if (value && !this.getPlugin('responsive')) {
            let me      = this,
                module  = await import(`../../src/plugin/Responsive.mjs`),
                plugins = me.plugins || [];

            plugins.push({
                module : module.default,
                appName: me.appName,
                value
            });

            me.plugins = plugins
        }
    }

    /**
     * Triggered after the role config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRole(value, oldValue) {
        this.changeVdomRootKey('role', value)
    }

    /**
     * Triggered after the scrollable config got changed
     * @param {String|Boolean} value
     * @param {String|Boolean|null} oldValue
     * @protected
     */
    afterSetScrollable(value, oldValue) {
        if (oldValue === undefined && !value) {
            return
        }

        let me = this;

        if (oldValue) {
            let oldOverflowKey = 'overflow';

            if (!Neo.isBoolean(oldValue)) {
                oldOverflowKey += Neo.capitalize(oldValue)
            }

            me.removeStyle([oldOverflowKey])
        }

        if (!Neo.isEmpty(value)) {
            let overflowKey = 'overflow';

            if (value && !Neo.isBoolean(value)) {
                overflowKey += Neo.capitalize(value)
            }

            if (value) {
                me.addStyle(overflowKey + ':auto');
                me.addCls('neo-scrollable')
            } else {
                me.removeCls('neo-scrollable')
            }
        }
    }

    /**
     * Triggered after the style config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetStyle(value, oldValue) {
        if (!(!value && oldValue === undefined)) {
            this.updateStyle()
        }
    }

    /**
     * Triggered after the tag config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTag(value, oldValue) {
        value && this.changeVdomRootKey('tag', value)
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        if (value || oldValue !== undefined) {
            let me          = this,
                {cls}       = me,
                needsUpdate = false;

            if (oldValue && cls.includes(oldValue)) {
                NeoArray.remove(cls, oldValue);
                needsUpdate = true
            }

            // We do not need to add a DOM based CSS selector, in case the theme is already inherited
            if (value !== me.parent?.theme) {
                value && NeoArray.add(cls, value);
                needsUpdate = true
            }

            if (needsUpdate) {
                me.cls = cls
            }
        }
    }

    /**
     * Triggered after the text config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        this.changeVdomRootKey('text', value)
    }

    /**
     * Triggered after the tooltip config got changed
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @protected
     */
    afterSetTooltip(value, oldValue) {
        oldValue?.destroy?.();

        if (value) {
            if (Neo.ns('Neo.tooltip.Base')) {
                this.createTooltip(value)
            } else {
                import('../tooltip/Base.mjs').then(() => {
                    this.createTooltip(value)
                })
            }
        }
    }

    /**
     * For styling purposes only.
     * To define button styles or component styles,
     * this will add a css class: neo-ntype-value
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetUi(value, oldValue) {
        let me  = this,
            cls = me.cls;

        if (oldValue) {
            NeoArray.remove(cls, `neo-${me.ntype}-${oldValue}`)
        }

        if (value && value !== '') {
            NeoArray.add(cls, `neo-${me.ntype}-${value}`)
        }

        me.cls = cls
    }

    /**
     * Triggered after the width config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetWidth(value, oldValue) {
        this.configuredWidth = addUnits(value);
        this.changeVdomRootKey('width', value)
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let controller = this.controller;

        if (controller) {
            controller.windowId = value
        }
    }

    /**
     * Triggered after the wrapperCls config got changed
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     */
    afterSetWrapperCls(value, oldValue) {
        oldValue = oldValue || [];
        value    = value    || [];

        let me       = this,
            {vdom}   = me,
            vdomRoot = me.getVdomRoot(),
            cls      = vdom.cls || [];

        if (vdom === vdomRoot) {
            // we need to merge changes
            cls = NeoArray.union(cls, value);
            NeoArray.remove(cls, NeoArray.difference(oldValue, value));
            vdom.cls = cls
        } else {
            // we are not using a wrapper => cls & wrapperCls share the same node
            value = value ? value : [];

            oldValue && NeoArray.remove(cls, oldValue);
            NeoArray.add(cls, value);

            vdom.cls = cls
        }

        me.update()
    }

    /**
     * Triggered after the wrapperStyle config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetWrapperStyle(value, oldValue) {
        if (!(!value && oldValue === undefined)) {
            this.updateStyle()
        }
    }

    /**
     * Aligns the top level node inside the main thread
     * @param {Object} spec={}
     * @returns {Promise<void>}
     */
    async alignTo(spec={}) {
        const
            me    = this,
            align = {
                ...me.align,
                ...spec,
                id                 : me.id,
                configuredFlex     : me.configuredFlex,
                configuredWidth    : me.configuredWidth,
                configuredHeight   : me.configuredHeight,
                configuredMinWidth : me.configuredMinWidth,
                configuredMinHeight: me.configuredMinHeight,
                configuredMaxWidth : me.configuredMaxWidth,
                configuredMaxHeight: me.configuredMaxHeight
            };

        if (align.target) {
            await Neo.main.DomAccess.align(align)
        }
    }

    /**
     * Triggered when accessing the cls config
     * @param {String[]|null} value
     * @protected
     */
    beforeGetCls(value) {
        return value ? [...value] : []
    }

    /**
     * Triggered when accessing the style config
     * @param {Object} value
     * @protected
     */
    beforeGetStyle(value) {
        return {...value}
    }

    /**
     * Triggered when accessing the wrapperCls config
     * @param {String[]|null} value
     * @protected
     */
    beforeGetWrapperCls(value) {
        return value ? [...value] : []
    }

    /**
     * Triggered when accessing the wrapperStyle config
     * @param {Object} value
     * @protected
     */
    beforeGetWrapperStyle(value) {
        return {...Object.assign(this.vdom.style || {}, value)}
    }

    /**
     * Triggered before the align config gets changed.
     * @param {Object|String} value
     * @param {Object} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetAlign(value, oldValue) {
        let me = this;

        // Just a simple 't-b'
        if (typeof value === 'string') {
            value = {
                edgeAlign: value
            }
        }

        return value
    }

    /**
     * Triggered before the cls config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @returns {String[]}
     * @protected
     */
    beforeSetCls(value, oldValue) {
        return NeoArray.union(value || [], this.baseCls, this.getBaseClass());
    }

    /**
     * Triggered before the controller config gets changed.
     * Creates a controller.Component instance if needed.
     * @param {Neo.controller.Component|Object} value
     * @param {Neo.controller.Component|null} oldValue
     * @returns {Neo.controller.Component}
     * @protected
     */
    beforeSetController(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            return ClassSystemUtil.beforeSetInstance(value, 'Neo.controller.Component', {
                component: this,
                windowId : this.windowId
            })
        }

        return value
    }

    /**
     * Triggered before the domListeners config gets changed.
     * @param {Object|Object[]} value
     * @param {Object[]} oldValue
     * @returns {Object[]}
     * @protected
     */
    beforeSetDomListeners(value, oldValue) {
        if (Neo.isObject(value)) {
            value = [value]
        }

        return value || []
    }

    /**
     * Triggered before the hideMode config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetHideMode(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'hideMode')
    }

    /**
     * Triggered before the keys config gets changed.
     * Creates a KeyNavigation instance if needed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.util.KeyNavigation|null}
     * @protected
     */
    beforeSetKeys(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            value = ClassSystemUtil.beforeSetInstance(value, KeyNavigation, {
                keyDownEventBubble: true,
                keys              : value
            })
        }

        return value
    }

    /**
     * Triggered before the plugins config gets changed.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @returns {Neo.plugin.Base[]}
     * @protected
     */
    beforeSetPlugins(value, oldValue) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                value[index] = ClassSystemUtil.beforeSetInstance(item, null, {
                    owner: this
                })
            })
        }

        return value
    }

    /**
     * Triggered before the silentVdomUpdate config gets changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetSilentVdomUpdate(value, oldValue) {
        if (value === true) {
            return Neo.isNumber(oldValue) ? (oldValue + 1) : 1
        }

        return (Neo.isNumber(oldValue) && oldValue > 0) ? (oldValue - 1) : 0
    }

    /**
     * Triggered before the updateDepth config gets changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetUpdateDepth(value, oldValue) {
        if (oldValue === undefined) {
            return value
        }

        return oldValue === -1 || value === -1 ? -1 : Math.max(value, oldValue)
    }

    /**
     * Changes the value of a vdom object attribute or removes it in case it has no value
     * @param {String} key
     * @param {Array|Number|Object|String|null} value
     */
    changeVdomRootKey(key, value) {
        let me   = this,
            root = me.getVdomRoot();

        if (value) {
            root[key] = value
        } else {
            delete root[key]
        }

        me.update()
    }

    /**
     * Override this method in case you need different mask markups.
     * The removal logic relies on the top level node having the cls 'neo-load-mask'
     * @param {Boolean|String} loadingMessage
     * @returns {Object} vdom
     */
    createLoadingMask(loadingMessage) {
        return {
            cls: ['neo-load-mask'],
            cn : [{
                cls: ['neo-load-mask-body'],
                cn : [{
                    cls: this.loadingSpinnerCls
                }, {
                    cls      : ['neo-loading-message'],
                    removeDom: !Neo.isString(loadingMessage),
                    text     : loadingMessage
                }]
            }]
        }
    }

    /**
     * Creates the tooltip instances
     * @param {Object|String} value
     * @protected
     */
    createTooltip(value) {
        if (typeof value === 'string') {
            value = {
                text: value
            }
        }

        let me = this;

        if (value.ownInstance) {
            me._tooltip = Neo.create('Neo.tooltip.Base', {
                ...value,
                appName    : me.appName,
                componentId: me.id,
                windowId   : me.windowId
            })
        } else {
            me._tooltip = value;
            Neo.tooltip.Base.createSingleton(me.app);
            me.addCls('neo-uses-shared-tooltip');
            me.update()
        }
    }

    /**
     * Unregister this instance from the ComponentManager
     * @param {Boolean} updateParentVdom=false true to remove the component from the parent vdom => real dom
     * @param {Boolean} silent=false true to update the vdom silently (useful for destroying multiple child items in a row)
     * todo: unregister events
     */
    destroy(updateParentVdom=false, silent=false) {
        let me                 = this,
            {parent, parentId} = me,
            parentVdom;

        me.revertFocus();

        me.controller = null; // triggers destroy()

        me.reference && me.getController()?.removeReference(me); // remove own reference from parent controllers

        me.plugins?.forEach(plugin => {
            plugin.destroy()
        });

        if (updateParentVdom && parentId) {
            if (parentId === 'document.body') {
                Neo.applyDeltas(me.appName, {action: 'removeNode', id: me.vdom.id})
            } else {
                parentVdom = parent.vdom;

                VDomUtil.removeVdomChild(parentVdom, me.vdom.id);
                parent[silent ? '_vdom' : 'vdom'] = parentVdom
            }
        }

        super.destroy();

        // We do want to prevent delayed calls after a component instance got destroyed.
        me.onFocusLeave = Neo.emptyFn;
        me.unmount      = Neo.emptyFn
    }

    /**
     * Convenience shortcut for Neo.manager.Component.down
     * @param {Object|String} config
     * @param {Boolean} returnFirstMatch=true
     * @returns {Neo.component.Base|null} The matching instance or null
     */
    down(config, returnFirstMatch=true) {
        return ComponentManager.down(this, config, returnFirstMatch)
    }

    /**
     * Calls focus() on the top level DOM node of this component or on a given node via id
     * @param {String} id=this.id
     * @param {Boolean} children=false
     */
    focus(id=this.id, children=false) {
        Neo.main.DomAccess.focus({children, id, windowId: this.windowId})
    }

    /**
     * Override this method to add dynamic values into this.cls
     * @returns {String[]}
     */
    getBaseClass() {
        const result = [];

        if (this.floating) {
            result.push('neo-floating')
        }

        return result
    }

    /**
     * Returns this.controller or the closest parent controller
     * @param {String} [ntype]
     * @returns {Neo.controller.Component|null}
     */
    getController(ntype) {
        let me = this,
            controller;

        if (!ntype) {
            controller = me[closestController];

            if (controller) {
                return controller
            }
        }

        controller = me.getConfigInstanceByNtype('controller', ntype);

        if (!ntype) {
            me[closestController] = controller
        }

        return controller
    }

    /**
     * Convenience shortcut
     * @param {String[]|String} id=this.id
     * @param {String} appName=this.appName
     * @returns {Promise<Neo.util.Rectangle|Neo.util.Rectangle[]>}
     */
    async getDomRect(id=this.id, appName=this.appName) {
        let result = await Neo.main.DomAccess.getBoundingClientRect({appName, id, windowId: this.windowId});

        if (Array.isArray(result)) {
            return result.map(rect => Rectangle.clone(rect))
        }

        return Rectangle.clone(result)
    }

    /**
     * Get the parent components as an array
     * @returns {Neo.component.Base[]}
     */
    getParents() {
        return ComponentManager.getParents(this)
    }

    /**
     * @param {Object|String} opts
     * @returns {Neo.plugin.Base|null}
     */
    getPlugin(opts) {
        if (Neo.isString(opts)) {
            if (!opts.startsWith('plugin-')) {
                opts = 'plugin-' + opts
            }

            opts = {ntype: opts}
        }

        let me = this,
            hasMatch;

        for (const plugin of me.plugins || []) {
            hasMatch = true;

            for (const key in opts) {
                if (plugin[key] !== opts[key]) {
                    hasMatch = false;
                    break
                }
            }

            if (hasMatch) {
                return plugin
            }
        }

        return null
    }

    /**
     * convenience shortcut
     * @param {String} value
     * @returns {Neo.component.Base|null}
     */
    getReference(value) {
        return this.down({reference: value})
    }

    /**
     * Walks up the vdom tree and returns the closest theme found
     * @returns {String}
     */
    getTheme() {
        let me         = this,
            themeMatch = 'neo-theme-',
            mainView, parentNodes;

        for (const item of me.cls || []) {
            if (item.startsWith(themeMatch)) {
                return item
            }
        }

        mainView = me.app?.mainView;

        if (mainView) {
            parentNodes = VDomUtil.getParentNodes(mainView.vdom, me.id);

            for (const node of parentNodes || []) {
                for (const item of node.cls || []) {
                    if (item.startsWith(themeMatch)) {
                        return item
                    }
                }
            }
        }

        return Neo.config.themes?.[0]
    }

    /**
     * Hide the component.
     * hideMode: 'removeDom'  uses vdom removeDom.
     * hideMode: 'visibility' uses css visibility.
     * If hideMode === 'removeDom' you can pass a timeout for custom css class hiding.
     * @param {Number} timeout
     */
    hide(timeout) {
        let me = this;

        if (me.hideMode !== 'visibility') {
            let removeFn = function () {
                if (me.parentId !== 'document.body') {
                    me.vdom.removeDom = true;
                    me.parent.updateDepth = 2;
                    me.parent.update()
                } else {
                    me.unmount()
                }
            }

            if (timeout) {
                me.timeout(timeout).then(removeFn)
            } else {
                removeFn()
            }
        } else {
            let style = me.style;
            style.visibility = 'hidden';
            me.style = style
        }

        me._hidden = true
    }

    /**
     *
     */
    init() {
        this.autoRender && this.render()
    }

    /**
     * Check if this component or any of its parents is floating
     * @returns {Boolean}
     */
    isFloating() {
        let me = this;

        if (me.floating) {
            return true
        }

        if (!me.parent) {
            return false
        }

        return  me.parent.floating
    }

    /**
     * @param {Number|String} value
     * @returns {Promise<number>}
     */
    async measure(value) {
        if (value != null) {
            if (value.endsWith('px')) {
                value = parseFloat(value)
            } else if (lengthRE.test(value)) {
                let {id, windowId} = this;
                value = await Neo.main.DomAccess.measure({id, value, windowId})
            } else if (!isNaN(value)) {
                value = parseFloat(value)
            }
        }

        return value
    }

    /**
     * Override this method to change the order configs are applied to this instance.
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @returns {Object} config
     */
    mergeConfig(...args) {
        let config = super.mergeConfig(...args),
            vdom   = config.vdom || config._vdom || {};

        // It should be possible to modify root level vdom attributes on instance level.
        // Note that vdom is not a real config, but implemented via get() & set().
        this._vdom = Neo.clone({...vdom, ...this._vdom || {}}, true);

        delete config._vdom;
        delete config.vdom;

        return config
    }

    /**
     * Can get called after the component got rendered. See the autoMount config as well.
     */
    async mount() {
        let me = this,
            child, childIds;

        if (!me.vnode) {
            throw new Error('Component vnode must be generated before mounting, use Component.render()');
        }

        // In case the component was already mounted, got unmounted and received vdom changes afterwards,
        // a new render() call is mandatory since delta updates could not get applied.
        // We need to clear the hasUnmountedVdomChanges state for all child components
        if (me.hasUnmountedVdomChanges) {
            // todo: the hasUnmountedVdomChanges flag changes should happen on render
            me.hasUnmountedVdomChanges = false;

            childIds = ComponentManager.getChildIds(me.vnode);

            childIds.forEach(id => {
                child = Neo.getComponent(id);

                if (child) {
                    child._hasUnmountedVdomChanges = false; // silent update
                }
            });
            // end todo

            me.render(true)
        } else {
            await currentWorker.promiseMessage('main', {
                action     : 'mountDom',
                appName    : me.appName,
                id         : me.id,
                html       : me.vnode.outerHTML,
                parentId   : me.getMountedParentId(),
                parentIndex: me.getMountedParentIndex()
            });

            delete me.vdom.removeDom;

            await me.timeout(30);

            me.mounted = true
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.keys?.register(me);
    }

    /**
     * @param {Object} data
     */
    onFocusEnter(data) {
        // If we are hidden, or unmounted while we still contain focus, we have to revert
        // focus to where it came from if possible
        this.focusEnterData = data
    }

    /**
     * @param {Object} data
     */
    onFocusLeave(data) {
        this.focusEnterData = null
    }

    /**
     * Triggered by manager.Focus
     * @name onFocusEnter
     * @function
     * @param {Array} path dom element ids upwards
     */

    /**
     * Triggered by manager.Focus
     * @name onFocusLeave
     * @function
     * @param {Array} path dom element ids upwards
     */

    /**
     * Triggered by manager.Focus
     * @name onFocusMove
     * @function
     * @param {Object} opts
     * @param {Array}  opts.newPath dom element ids upwards
     * @param {Array}  opts.oldPath dom element ids upwards
     */

    /**
     * Remove a cls from the vdomRoot
     * @param {String} value
     */
    removeCls(value) {
        let cls = this.cls;

        NeoArray.remove(cls, value);
        this.cls = cls
    }



    /**
     * Either a string like 'color' or an array containing style attributes to remove
     * @param {String|Array} value camelCase only
     * @returns {Object} all styles of this.el
     */
    removeStyle(value) {
        if (!Array.isArray(value)) {
            value = [value]
        }

        let {style}  = this,
            doUpdate = false;

        Object.keys(style).forEach(key => {
            if (value.indexOf(key) > -1) {
                delete style[key];
                doUpdate = true
            }
        });

        if (doUpdate) {
            this.style = style
        }

        return style
    }

    /**
     *
     */
    revertFocus() {
        let relatedTarget = this.focusEnterData?.relatedTarget;

        if (this.containsFocus && relatedTarget) {
            Neo.getComponent(relatedTarget.id)?.focus()
        }
    }

    /**
     * Show the component.
     * hideMode: 'removeDom'  uses vdom removeDom.
     * hideMode: 'visibility' uses css visibility.
     */
    show() {
        let me = this;

        if (me.hideMode !== 'visibility') {
            delete me.vdom.removeDom;

            if (me.silentVdomUpdate) {
                me.needsVdomUpdate = true
            } else if (me.parentId !== 'document.body') {
                me.parent.updateDepth = 2;
                me.parent.update()
            } else {
                !me.mounted && me.render(true)
            }
        } else {
            let style = me.style;
            delete style.visibility;
            me.style = style
        }

        me._hidden = false
    }

    /**
     * Toggle a cls inside the vdomRoot of the component
     * @param {String} value
     * @param {Boolean} [add] Use this param to enforce an add() or remove() operation.
     */
    toggleCls(value, add) {
        let cls = this.cls;

        NeoArray.toggle(cls, value, add);
        this.cls = cls
    }

    /**
     * Removes the component DOM
     */
    unmount() {
        let me = this;

        me.vdom.removeDom = true;

        me._hidden = true; // silent update
        me.mounted = false;

        Neo.applyDeltas(me.appName, {action: 'removeNode', id: me.vdom.id})
    }

    /**
     * Convenience shortcut for Neo.manager.Component.up
     * @param {Object|String} config
     * @returns {Neo.component.Base|null} The matching instance or null
     */
    up(config) {
        return ComponentManager.up(this.id, config)
    }

    /**
     *
     */
    updateStyle() {
        let me       = this,
            {vdom}   = me,
            vdomRoot = me.getVdomRoot();

        if (vdom !== vdomRoot) {
            vdom    .style = me.wrapperStyle;
            vdomRoot.style = me.style
        } else {
            vdom.style = {...me.wrapperStyle, ...me.style}
        }

        me.update()
    }

    /**
     * In case you are sure a DOMRect exists, use getDomRect()
     * Otherwise you can wait for it using this method.
     * @example:
     *     await this.render(true);
     *     await this.waitForDomRect();
     * @param {Object}          opts
     * @param {String}          opts.appName=this.appName
     * @param {Number}          opts.attempts=10 Reruns in case the rect height or width equals 0
     * @param {Number}          opts.delay=50    Time in ms before checking again
     * @param {String[]|String} opts.id=this.id
     * @returns {Promise<Neo.util.Rectangle|Neo.util.Rectangle[]>}
     */
    async waitForDomRect({appName=this.appName, attempts=10, delay=50, id=this.id}) {
        let me     = this,
            result = await me.getDomRect(id, appName),
            reRun  = false;

        if (Array.isArray(result)) {
            result.forEach(rect => {
                if (rect.height < 1 || rect.width < 1) {
                    reRun = true
                }
            })
        } else if (result.height < 1 || result.width < 1) {
            reRun = true
        }

        if (reRun && attempts > 0) {
            await me.timeout(delay);
            return await me.waitForDomRect({appName, attempts: attempts-1, delay, id})
        }

        return result
    }
}

/**
 * manager.Focus fires the event after focusEnter, focusLeave or focusMove
 * @event focusChange
 * @param {Object} data
 * @param {Object[]} [data.path] dom element ids upwards
 * @param {Object[]} [data.oldPath] dom element ids upwards
 */

/**
 * manager.Focus fires the event when the component id is included inside the dom id path
 * @event focusEnter
 * @param {Object} data
 * @param {Object[]} data.path dom element ids upwards
 */

/**
 * manager.Focus fires the event when the component id is not included inside the dom id path
 * @event focusLeave
 * @param {Object} data
 * @param {Object[]} data.oldPath dom element ids upwards
 */

/**
 * manager.Focus fires the event when the component id is included inside the dom id path, but the path itself changed
 * @event focusMove
 * @param {Object} data
 * @param {Object[]} data.path dom element ids upwards
 * @param {Object[]} data.oldPath dom element ids upwards
 */

export default Neo.setupClass(Component);
