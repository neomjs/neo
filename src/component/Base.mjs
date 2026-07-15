import Abstract         from './Abstract.mjs';
import ClassSystemUtil  from '../util/ClassSystem.mjs';
import ComponentManager from '../manager/Component.mjs';
import KeyNavigation    from '../util/KeyNavigation.mjs';
import Logger           from '../util/Logger.mjs';
import NeoArray         from '../util/Array.mjs';
import Rectangle        from '../util/Rectangle.mjs';
import Style            from '../util/Style.mjs';
import VDomUpdate       from '../manager/VDomUpdate.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VNodeUtil        from '../util/VNode.mjs';
import {isDescriptor}   from '../core/ConfigSymbols.mjs';

const
    addUnits              = value => value == null ? value : isNaN(value) ? value : `${value}px`,
    classContributions    = Symbol('classContributions'),
    classNodesInitialized = Symbol('classNodesInitialized'),
    classProjection       = Symbol('classProjection'),
    classOwners           = {
        disabled     : Symbol('disabled'),
        intrinsicRoot: Symbol('intrinsicRoot'),
        intrinsicWrap: Symbol('intrinsicWrap'),
        isLoading    : Symbol('isLoading'),
        scrollable   : Symbol('scrollable'),
        sharedTooltip: Symbol('sharedTooltip'),
        theme        : Symbol('theme'),
        ui           : Symbol('ui')
    },
    closestController         = Symbol.for('closestController'),
    lengthRE                  = /^\d+\w+$/,
    normalizeClassNames       = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))],
    wrapperClassContributions = Symbol('wrapperClassContributions'),
    wrapperClassProjection    = Symbol('wrapperClassProjection');

/**
 * @typedef {Object} ComponentReferenceConfig
 * @property {String} componentId The id of the child component instance represented by this placeholder.
 * @property {String} [id] The root VNode id for the referenced component. Defaults to `componentId` when omitted.
 * @property {Boolean} [removeDom=false] Removes the referenced component's DOM while preserving the VDom placeholder.
 */

/**
 * @typedef {Object|ComponentReferenceConfig} VDomNodeConfig
 * @property {String} [tag='div'] The HTML tag name used to create the node. `fragment` creates a transparent container.
 * @property {String} [id] A stable VNode id. Component code usually lets the framework generate this value.
 * @property {String|String[]} [cls] CSS classes to apply to the node.
 * @property {Object|String} [style] Inline style declaration for the node.
 * @property {String|Number} [html] Raw HTML content. Exclusive with `text` and `cn`.
 * @property {String|Number|Boolean} [text] Text content. Exclusive with `html` and `cn`.
 * @property {VDomNodeConfig[]} [cn] Child VDom node configs. Exclusive with `html` and `text`.
 * @property {'vnode'|'text'|'root'} [vtype='vnode'] VNode type. Use `text` for pure text nodes.
 * @property {Boolean} [static=false] Excludes this node and its children from delta updates.
 * @property {Boolean} [removeDom=false] Removes the corresponding DOM node while keeping the logical VDom node.
 * @property {Object.<String, String|Number|Boolean>} [data] Values rendered as `data-*` attributes.
 * @property {String} [flag] Component-local lookup marker for direct access to this VDom node.
 * @property {String|Number} [tabIndex] HTML tabindex attribute.
 * @property {String} [role] ARIA role attribute.
 * @property {Boolean} [disabled] HTML disabled attribute.
 */

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
            value         : {
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
         * CSS selectors authored by the component consumer.
         *
         * `clone: 'none'` preserves the private provenance carried by the aggregate getter until
         * `beforeSetCls()` extracts a fresh authored-only array. Functional components keep the
         * inherited default cloning contract from `component.Abstract`.
         * @member {String[]|null} cls=null
         */
        cls: {
            [isDescriptor]: true,
            clone         : 'none',
            value         : null
        },
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
         * True to mount this component into the viewport outside of the document flow
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
         *
         * **Important:** When `vdom === vdomRoot` (single node component), the `wrapperStyle` mechanism
         * creates a persistent state loop to support runtime VDOM mutations.
         * This means that to *remove* a style property you previously set, you MUST set it to `null`.
         * Using `delete` or setting `undefined` will revert to the "previous state", which unfortunately
         * includes the very value you are trying to remove if it has leaked into `wrapperStyle`.
         *
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
         * By default, a single, shared Tooltip instance is used for all widgets that request
         * a tooltip. It reconfigures itself from the widget's definition just before showing.
         *
         * If a widget needs its own instance for any reason, include the property `ownInstance: true`
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
        wrapperCls_: {
            [isDescriptor]: true,
            clone         : 'none',
            value         : null
        },
        /**
         * Top level style attributes. Useful in case getVdomRoot() does not point to the top level DOM node.
         *
         * **Note:** The getter for this config reads `vdom.style` as a default value to support runtime mutations.
         * This creates the persistent state loop described in the `style_` config documentation.
         *
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
         * @member {VDomNodeConfig} _vdom={}
         */
        _vdom: {}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        let me = this;

        Object.defineProperties(me, {
            [classContributions]: {
                value: new Map()
            },
            [classNodesInitialized]: {
                value   : false,
                writable: true
            },
            [wrapperClassContributions]: {
                value: new Map()
            }
        });

        if (!Object.hasOwn(me, '_vdom') && me._vdom) {
            me._vdom = Neo.clone(me._vdom, true)
        }

        super.construct(config)
    }

    /**
     * Returns true if this Component is fully visible, that is it is not hidden and has no hidden ancestors
     */
    get isVisible() {
        return this.mounted && !this.hidden && (!this.parent || this.parent.isVisible);
    }

    /**
     * The setter will handle vdom updates automatically
     * @member {VDomNodeConfig} vdom=this._vdom
     */
    get vdom() {
        return this._vdom
    }
    set vdom(value) {
        this.afterSetVdom(value, value)
    }

    /**
     * Adds classes to the caller-authored contribution, or to a named engine owner.
     * @param {String|String[]} value
     * @param {*}               [owner] Stable owner key for engine-derived classes.
     */
    addCls(value, owner) {
        let cls = owner === undefined ? this.getAuthoredCls() : this.getClsContribution(owner);

        NeoArray.add(cls, value);

        if (owner === undefined) {
            this.cls = cls
        } else {
            this.setClsContribution(owner, cls)
        }
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
     * Adds wrapper classes to the caller-authored contribution, or to a named engine owner.
     * @param {String|String[]} value
     * @param {*}               [owner] Stable owner key for engine-derived classes.
     */
    addWrapperCls(value, owner) {
        let cls = owner === undefined ? this.getAuthoredWrapperCls() : this.getWrapperClsContribution(owner);

        NeoArray.add(cls, value);

        if (owner === undefined) {
            this.wrapperCls = cls
        } else {
            this.setWrapperClsContribution(owner, cls)
        }
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
        this.syncClassNodes()
    }

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        this.setClsContribution(classOwners.disabled, value ? ['neo-disabled'] : [])
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

        let me = this;

        if (me.configsApplied) {
            me.ensureStableIds();
            me.update()
        }
    }

    /**
     * Triggered after the isLoading config got changed
     * @param {Boolean|String} value
     * @param {Boolean|String} oldValue
     * @protected
     */
    afterSetIsLoading(value, oldValue) {
        if (value || oldValue !== undefined) {
            let me     = this,
                {vdom} = me,
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

            me.setWrapperClsContribution(classOwners.isLoading, value ? ['neo-masked'] : []);
            me.vdom = vdom
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
                module  = await me.trap(import(`../../src/plugin/Responsive.mjs`)),
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
                me.setClsContribution(classOwners.scrollable, ['neo-scrollable'])
            } else {
                me.setClsContribution(classOwners.scrollable, [])
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
            let me = this;

            // We do not need to add a DOM based CSS selector in case the theme is already inherited.
            me.setClsContribution(classOwners.theme, value && value !== me.parent?.theme ? [value] : [])
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
        this.setClsContribution(classOwners.sharedTooltip, []);

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
        this.setClsContribution(
            classOwners.ui,
            value && value !== '' ? [`neo-${this.ntype}-${value}`] : []
        )
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
        this.syncClassNodes()
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
                configuredMaxHeight: me.configuredMaxHeight,
                windowId           : me.windowId
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
        return this.projectClassNames(this.composeCls(value), value, classProjection)
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
        return this.projectClassNames(this.composeWrapperCls(value), value, wrapperClassProjection)
    }

    /**
     * Triggered when accessing the wrapperStyle config.
     *
     * It merges the current `vdom.style` into the result to ensure that runtime style mutations
     * (hacks) or initial VDOM styles are preserved and not overwritten by the config value.
     *
     * **Warning:** This creates the persistent state loop described in the `style_` config.
     * Reading the output (`vdom.style`) as the default for the input (`wrapperStyle`) means
     * merged styles become permanent unless explicitly cleared with `null`.
     *
     * @param {Object} value
     * @protected
     */
    beforeGetWrapperStyle(value) {
        return {...this.vdom.style, ...value}
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
        return this.resolveAuthoredClassNames(value, classProjection)
    }

    /**
     * Normalizes caller-authored wrapper classes without absorbing layout or plugin contributions.
     * @param {String[]|String|null} value
     * @param {String[]|null}        oldValue
     * @returns {String[]}
     * @protected
     */
    beforeSetWrapperCls(value, oldValue) {
        return this.resolveAuthoredClassNames(value, wrapperClassProjection)
    }

    /**
     * Composes caller-authored root classes with structural and engine-owned contributions.
     * @summary Keeps class provenance separate while preserving the public aggregate getter.
     * @param {String[]|String|null} [value]
     * @returns {String[]}
     * @protected
     */
    composeCls(value=this.getAuthoredCls()) {
        return NeoArray.union(
            normalizeClassNames(value),
            normalizeClassNames(this.baseCls),
            normalizeClassNames(this.getBaseClass()),
            ...[...(this[classContributions]?.values() || [])]
        )
    }

    /**
     * Composes caller-authored wrapper classes with layout and engine-owned contributions.
     * @summary Keeps wrapper ownership independent from the physical VDOM projection.
     * @param {String[]|String|null} [value]
     * @returns {String[]}
     * @protected
     */
    composeWrapperCls(value=this.getAuthoredWrapperCls()) {
        return NeoArray.union(
            normalizeClassNames(value),
            ...[...(this[wrapperClassContributions]?.values() || [])]
        )
    }

    /**
     * Marks an aggregate getter clone with its authored and rendered source projections.
     * @summary Preserves provenance when legacy callers mutate and reassign the same clone.
     * @param {String[]} value
     * @param {String[]} authored
     * @param {Symbol}   projectionKey
     * @returns {String[]}
     * @protected
     */
    projectClassNames(value, authored, projectionKey) {
        Object.defineProperty(value, projectionKey, {
            value: {
                authored: normalizeClassNames(authored),
                rendered: [...value]
            }
        });

        return value
    }

    /**
     * Resolves authored intent from a fresh input or a mutate-and-reassign getter clone.
     * @summary Stops rendered owner tokens from being promoted by legacy array round trips.
     * @param {String[]|String|null} value
     * @param {Symbol}              projectionKey
     * @returns {String[]}
     * @protected
     */
    resolveAuthoredClassNames(value, projectionKey) {
        const projection = value?.[projectionKey];

        if (!projection) {
            return normalizeClassNames(value)
        }

        const {authored, rendered} = projection;

        return normalizeClassNames(value.filter(cls => authored.includes(cls) || !rendered.includes(cls)))
    }

    /**
     * Returns only the caller-authored root class input stored by the reactive config.
     * @summary Prevents derived classes from being promoted during mutation or serialization.
     * @returns {String[]}
     */
    getAuthoredCls() {
        return normalizeClassNames(this.getConfig('cls')?.get())
    }

    /**
     * Returns only the caller-authored wrapper class input stored by the reactive config.
     * @summary Prevents layout classes from being promoted during mutation or serialization.
     * @returns {String[]}
     */
    getAuthoredWrapperCls() {
        return normalizeClassNames(this.getConfig('wrapperCls')?.get())
    }

    /**
     * Returns one engine owner's current root contribution.
     * @param {*} owner
     * @returns {String[]}
     * @protected
     */
    getClsContribution(owner) {
        return [...(this[classContributions]?.get(owner) || [])]
    }

    /**
     * Returns the replay-safe source value for a mutable component property.
     * @summary Keeps class snapshots caller-authored while preserving normal getter semantics for every other key.
     * @param {String} key Property or namespace path.
     * @returns {*}
     */
    getMutationSnapshotValue(key) {
        if (key === 'cls') {
            return this.getAuthoredCls()
        }

        if (key === 'wrapperCls') {
            return this.getAuthoredWrapperCls()
        }

        return super.getMutationSnapshotValue(key)
    }

    /**
     * Returns a recreatable VDOM snapshot without promoting composed classes into intrinsic ownership.
     * @summary Preserves structural VDOM classes while reactive owners rebuild their own contributions.
     * @returns {Object}
     * @protected
     */
    getSerializableVdom() {
        let me       = this,
            vdom     = Neo.clone(me.vdom, true),
            liveRoot = me.getVdomRoot(),
            vdomRoot = liveRoot === me.vdom ? vdom : VDomUtil.getById(vdom, liveRoot.id);

        if (me[classNodesInitialized] && vdomRoot) {
            vdomRoot.cls = me.getClsContribution(classOwners.intrinsicRoot);

            if (vdom !== vdomRoot) {
                vdom.cls = me.getWrapperClsContribution(classOwners.intrinsicWrap)
            }
        }

        return vdom
    }

    /**
     * Returns one engine owner's current wrapper contribution.
     * @param {*} owner
     * @returns {String[]}
     * @protected
     */
    getWrapperClsContribution(owner) {
        return [...(this[wrapperClassContributions]?.get(owner) || [])]
    }

    /**
     * Replaces one engine owner's complete root class contribution.
     * @summary Gives config hooks and plugins exact ownership over their rendered tokens.
     * @param {*}                     owner Stable owner key.
     * @param {String[]|String|null} value
     * @param {Boolean}              [silent=false]
     * @returns {Boolean} True when the contribution changed.
     */
    setClsContribution(owner, value, silent=false) {
        return this.setClassContribution(classContributions, owner, value, silent)
    }

    /**
     * Replaces one engine owner's complete wrapper class contribution.
     * @summary Gives layouts and plugins exact ownership over their rendered tokens.
     * @param {*}                     owner Stable owner key.
     * @param {String[]|String|null} value
     * @param {Boolean}              [silent=false]
     * @returns {Boolean} True when the contribution changed.
     */
    setWrapperClsContribution(owner, value, silent=false) {
        return this.setClassContribution(wrapperClassContributions, owner, value, silent)
    }

    /**
     * Updates one contribution map and projects the resulting logical class layers.
     * @summary Centralizes deduplication, owner replacement, and silent VDOM batching.
     * @param {Symbol}                mapKey
     * @param {*}                     owner
     * @param {String[]|String|null} value
     * @param {Boolean}              silent
     * @returns {Boolean}
     * @protected
     */
    setClassContribution(mapKey, owner, value, silent) {
        if (owner === undefined || owner === null) {
            throw new Error('A stable class contribution owner is required')
        }

        const
            map      = this[mapKey],
            next     = normalizeClassNames(value),
            previous = map.get(owner) || [];

        if (Neo.isEqual(next, previous)) {
            return false
        }

        if (next.length) {
            map.set(owner, next)
        } else {
            map.delete(owner)
        }

        this.syncClassNodes(silent);

        return true
    }

    /**
     * Rebuilds the physical class projection from the root and wrapper ownership layers.
     * @summary Retains shared tokens until their final logical owner releases them.
     * @param {Boolean} [silent=false]
     * @protected
     */
    syncClassNodes(silent=false) {
        let me        = this,
            wasSilent = me.silentVdomUpdate,
            {vdom}    = me,
            vdomRoot  = me.getVdomRoot();

        if (!me[classNodesInitialized]) {
            const
                intrinsicRoot = normalizeClassNames(vdomRoot?.cls),
                intrinsicWrap = vdom === vdomRoot ? [] : normalizeClassNames(vdom?.cls);

            intrinsicRoot.length && me[classContributions].set(classOwners.intrinsicRoot, intrinsicRoot);
            intrinsicWrap.length && me[wrapperClassContributions].set(classOwners.intrinsicWrap, intrinsicWrap);
            me[classNodesInitialized] = true
        }

        if (silent) {
            me.silentVdomUpdate = true
        }

        try {
            const
                cls        = me.cls,
                wrapperCls = me.wrapperCls;

            if (vdom === vdomRoot) {
                vdom.cls = NeoArray.union(wrapperCls, cls)
            } else {
                vdom.cls     = [...wrapperCls];
                vdomRoot.cls = [...cls]
            }

            me.update()
        } finally {
            if (silent) {
                me.silentVdomUpdate = wasSilent
            }
        }
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
            me.setClsContribution(classOwners.sharedTooltip, ['neo-uses-shared-tooltip'])
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
                Neo.applyDeltas(me.windowId, {action: 'removeNode', id: me.vdom.id})
            } else {
                parentVdom = parent.vdom;

                VDomUtil.removeVdomChild(parentVdom, me.vdom.id);
                parent[silent ? '_vdom' : 'vdom'] = parentVdom
            }
        }

        // Destruction is a complete render-flight cancellation boundary:
        // 1. Settle every promise parked on this component's flight (the initiator's public
        //    promiseUpdate AND merged children) with the house destroy sentinel — and remove the
        //    callback entry itself, or it leaks forever (executeCallbacks never fires for a dead
        //    owner).
        // 2. Release the in-flight registry entry: a lingering one makes every ancestor update
        //    yield to it forever (nothing can ever settle it — the reply targets a dead
        //    component), silently freezing the ancestor's delta stream.
        // 3. Re-trigger ancestors already queued behind this component — exactly once.
        VDomUpdate.rejectCallbacks(me.id, Neo.isDestroyed);
        VDomUpdate.unregisterInFlightUpdate(me.id);
        VDomUpdate.triggerPostUpdates(me.id);

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
     * @param {Boolean} preventScroll
     */
    focus(id=this.id, children=false, preventScroll) {
        Neo.main.DomAccess.focus({children, id, preventScroll, windowId: this.windowId})
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
     * @param {String} windowId=this.windowId
     * @returns {Promise<Neo.util.Rectangle|Neo.util.Rectangle[]>}
     */
    async getDomRect(id=this.id, windowId=this.windowId) {
        let result = await this.trap(Neo.main.DomAccess.getBoundingClientRect({id, windowId}));

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

        return (Neo.windowConfigs?.[me.windowId] || Neo.config).themes?.[0]
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
        this.autoInitVnode && this.initVnode()
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
                value = await this.trap(Neo.main.DomAccess.measure({id, value, windowId}))
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

        this.ensureStableIds();

        delete config._vdom;
        delete config.vdom;

        return config
    }

    /**
     * Can get called after the component got vnodeInitialized. See the autoMount config as well.
     * We have decided to always force a new initVnode(true) call here.
     * Rationale:
     * 1. The overhead of tracking hasUnmountedVdomChanges on every vdom update is removed.
     * 2. The edge case of mounting a pre-calculated but untouched vnode tree is < 1%.
     * 3. The cost of re-generating the vnode tree is low enough to justify the robustness and simplicity.
     * 4. This ensures that the DOM is always mounted with the most up-to-date vdom state.
     */
    async mount() {
        return this.initVnode(true)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.keys?.register(this)
    }

    /**
     * Captures scroll events from the main thread and syncs the logical vdom state.
     *
     * **Performance / Hot Path Note:**
     * Scroll events fire continuously. We explicitly check the most common scrolling targets
     * (the component's root, its wrapper, or its items root) in O(1) time before falling back
     * to `VDomUtil.getById`. A full `getById` recursive tree traversal is extremely expensive
     * (O(N) where N is all DOM nodes) and will lock up the App Worker during fast scrolling
     * on complex components like Grids.
     *
     * @param {Object} data
     */
    onScrollCapture(data) {
        super.onScrollCapture(data);

        let me = this;

        if (me._vdom) {
            let targetId = data.target.id,
                vdomNode;

            // Fast Path 1: Target is the root node itself
            if (me._vdom.id === targetId) {
                vdomNode = me._vdom;
            }
            // Fast Path 2: Target is the logical vdom root (e.g. GridBody scroll container)
            else if (me.id === targetId) {
                // me.getVdomRoot() returns the node assigned me.id by ensureStableIds
                let vdomRoot = me.getVdomRoot();
                if (vdomRoot && vdomRoot.id === targetId) {
                    vdomNode = vdomRoot;
                }
            }
            // Fast Path 3: Target is the designated items container
            else if (me.getVdomItemsRoot) {
                let itemsRoot = me.getVdomItemsRoot();
                if (itemsRoot && itemsRoot.id === targetId) {
                    vdomNode = itemsRoot;
                }
            }

            // Fallback: Expensive full tree traversal
            if (!vdomNode) {
                vdomNode = VDomUtil.getById(me._vdom, targetId);
            }

            if (vdomNode) {
                vdomNode.scrollTop  = data.scrollTop;
                vdomNode.scrollLeft = data.scrollLeft
            }
        }
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
     * Removes classes from the caller-authored contribution, or from a named engine owner.
     * @param {String|String[]} value
     * @param {*}               [owner] Stable owner key for engine-derived classes.
     */
    removeCls(value, owner) {
        let cls = owner === undefined ? this.getAuthoredCls() : this.getClsContribution(owner);

        NeoArray.remove(cls, value);

        if (owner === undefined) {
            this.cls = cls
        } else {
            this.setClsContribution(owner, cls)
        }
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
                me.parent.updateDepth = -1;
                me.parent.update()
            } else {
                !me.mounted && me.initVnode(true)
            }
        } else {
            let style = me.style;
            // We need to set null, since the style might be inside wrapperStyle,
            // which would get re-applied in case we just delete the property.
            style.visibility = null;
            me.style = style
        }

        me._hidden = false
    }

    /**
     * Toggles classes in the caller-authored contribution, or in a named engine owner.
     * @param {String}  value
     * @param {Boolean} [add] Use this param to enforce an add() or remove() operation.
     * @param {*}       [owner] Stable owner key for engine-derived classes.
     */
    toggleCls(value, add, owner) {
        let cls = owner === undefined ? this.getAuthoredCls() : this.getClsContribution(owner);

        NeoArray.toggle(cls, value, add);

        if (owner === undefined) {
            this.cls = cls
        } else {
            this.setClsContribution(owner, cls)
        }
    }

    /**
     * Removes the component DOM
     */
    unmount() {
        let me = this;

        me.vdom.removeDom = true;

        me._hidden = true; // silent update
        me.mounted = false;

        Neo.applyDeltas(me.windowId, {action: 'removeNode', id: me.vdom.id})
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
     * Serializes the component into a JSON-compatible object.
     * Extends the core.Base serialization with component-specific properties.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            align       : me.align,
            cls         : me.cls,
            controller  : me.controller?.toJSON(),
            disabled    : me.disabled,
            height      : me.height,
            hidden      : me.hidden,
            keys        : me.keys?.toJSON(),
            reference   : me.reference,
            role        : me.role,
            style       : me.style,
            theme       : me.theme,
            ui          : me.ui,
            vdom        : me.vdom,
            vnode       : me.vnode,
            width       : me.width,
            wrapperCls  : me.wrapperCls,
            wrapperStyle: me.wrapperStyle
        }
    }

    /**
     * Serializes the source configuration needed to recreate this component.
     * @summary Separates caller-authored class inputs from the live rendered projection returned by toJSON().
     * @returns {Object}
     */
    toRecreationConfig() {
        return {
            ...this.toJSON(),
            cls       : this.getAuthoredCls(),
            vdom      : this.getSerializableVdom(),
            wrapperCls: this.getAuthoredWrapperCls()
        }
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
     *     await this.initVnode(true);
     *     await this.waitForDomRect();
     * @param {Object}          opts
     * @param {Number}          opts.attempts=10 Reruns in case the rect height or width equals 0
     * @param {Number}          opts.delay=50    Time in ms before checking again
     * @param {String[]|String} opts.id=this.id
     * @param {String}          opts.windowId=this.windowId
     * @returns {Promise<Neo.util.Rectangle|Neo.util.Rectangle[]>}
     */
    async waitForDomRect({attempts=10, delay=50, id=this.id, windowId=this.windowId} = {}) {
        let me     = this,
            result = await me.getDomRect(id),
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
            return await me.waitForDomRect({attempts: attempts-1, delay, id, windowId})
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
