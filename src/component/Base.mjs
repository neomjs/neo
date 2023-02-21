import ClassSystemUtil  from '../util/ClassSystem.mjs';
import ComponentManager from '../manager/Component.mjs';
import CoreBase         from '../core/Base.mjs';
import DomEventManager  from '../manager/DomEvent.mjs';
import KeyNavigation    from '../util/KeyNavigation.mjs';
import Logger           from '../util/Logger.mjs';
import NeoArray         from '../util/Array.mjs';
import Observable       from '../core/Observable.mjs';
import Style            from '../util/Style.mjs';
import Util             from '../core/Util.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VNodeUtil        from '../util/VNode.mjs';

/**
 * @class Neo.component.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    /**
     * Valid values for hideMode
     * @member {String[]} hideModes=['removeDom','visibility']
     * @protected
     * @static
     */
    static hideModes = ['removeDom', 'visibility']
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

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
         * The name of the App this component belongs to
         * @member {String|null} appName_=null
         */
        appName_: null,
        /**
         * True automatically mounts a component after being rendered.
         * Use this for the top level component of your app.
         * @member {Boolean} autoMount=false
         * @tutorial 02_ClassSystem
         */
        autoMount: false,
        /**
         * True automatically renders a component after being created inside the init call.
         * Use this for the top level component of your app.
         * @member {Boolean} autoRender=false
         * @see {@link Neo.component.Base#init init}
         * @tutorial 02_ClassSystem
         */
        autoRender: false,
        /**
         * CSS selectors to apply to the root level node of this component
         * @member {String[]} baseCls=[]
         */
        baseCls: [],
        /**
         * Bind configs to model.Component data properties.
         * Example for a button.Base:
         * @example
         * bind: {
         *     iconCls: data => `fa fa-{$data.icon}`,
         *     text   : data => data.foo.bar
         * }
         * @see https://github.com/neomjs/neo/blob/dev/examples/model
         * @member {Object|null} bind=null
         */
        bind: null,
        /**
         * Custom CSS selectors to apply to the root level node of this component
         * You can override baseCls to remove default selectors.
         * @member {String[]} cls_=null
         */
        cls_: null,
        /**
         * manager.Focus will change this flag on focusin & out dom events
         * @member {Boolean} containsFocus_=false
         * @protected
         */
        containsFocus_: false,
        /**
         * Assign a component controller to this component (pass an imported module or the string based class name)
         * @member {Neo.controller.Component|String} controller_=null
         */
        controller_: null,
        /**
         * Convenience shortcut to access the data config of the closest model.Component.
         * Read only.
         * @member {Object} data_=null
         * @protected
         */
        data_: null,
        /**
         * Disabled components will get the neo-disabled cls applied and won't receive DOM events
         * @member {Boolean} disabled_=false
         */
        disabled_: false,
        /**
         * An array of domListener configs
         * @member {Object[]|null} domListeners_=null
         * @example
         * afterSetStayOnHover(value, oldValue) {
         *     if (value) {
         *         let me           = this,
         *             domListeners = me.domListeners;
         *
         *         domListeners.push(
         *             {mouseenter: me.onMouseEnter, scope: me},
         *             {mouseleave: me.onMouseLeave, scope: me}
         *         );
         *
         *        me.domListeners = domListeners;
         *    }
         *}
         */
        domListeners_: null,
        /**
         * Set this config to true to dynamically import a DropZone module & create an instance
         * @member {Boolean} droppable_=false
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
         * Internal flag which will get set to true on mount
         * @member {Boolean} hasBeenMounted=false
         * @protected
         */
        hasBeenMounted: false,
        /**
         * Internal flag
         * @member {Boolean} hasRenderingListener=false
         * @protected
         */
        hasRenderingListener: false,
        /**
         * Internal flag for vdom changes after a component got unmounted
         * (delta updates can no longer get applied & a new render call is required before re-mounting)
         * @member {Boolean} hasUnmountedVdomChanges_=false
         * @protected
         */
        hasUnmountedVdomChanges_: false,
        /**
         * Shortcut for style.height, defaults to px
         * @member {Number|String|null} height_=null
         */
        height_: null,
        /**
         * Initial setting to hide or show the component and
         * you can use either hide()/show() or change this config directly to change the hidden state
         * @member {Boolean} hidden_=false
         */
        hidden_: false,
        /**
         * Used for hide and show and defines if the component
         * should use css visibility:'hidden' or vdom:removeDom
         * @member {String} hideMode_='removeDom'
         */
        hideMode_: 'removeDom',
        /**
         * The top level innerHTML of the component
         * @member {String|null} html_=null
         */
        html_: null,
        /**
         * Internal flag which will get set to true while an update request (worker messages) is in progress
         * @member {Boolean} isVdomUpdating=false
         * @protected
         */
        isVdomUpdating: false,
        /**
         * Using the keys config will create an instance of Neo.util.KeyNavigation.
         * @see {@link Neo.util.KeyNavigation KeyNavigation}
         * @member {Object} keys_=null
         */
        keys_: null,
        /**
         * Shortcut for style.maxHeight, defaults to px
         * @member {Number|String|null} maxHeight_=null
         */
        maxHeight_: null,
        /**
         * Shortcut for style.maxWidth, defaults to px
         * @member {Number|String|null} maxWidth_=null
         */
        maxWidth_: null,
        /**
         * Shortcut for style.minHeight, defaults to px
         * @member {Number|String|null} minHeight_=null
         */
        minHeight_: null,
        /**
         * Shortcut for style.minWidth, defaults to px
         * @member {Number|String|null} minWidth_=null
         */
        minWidth_: null,
        /**
         * Optionally add a model.Component
         * @member {Object|null} model_=null
         */
        model_: null,
        /**
         * Override specific model data properties.
         * This will merge the content.
         * @member {Object|null} model_=null
         */
        modelData: null,
        /**
         * True in case the component is mounted to the DOM
         * @member {Boolean} mounted_=false
         * @protected
         */
        mounted_: false,
        /**
         * Internal flag which will get set to true in case an update call arrives while another update is running
         * @member {Boolean} needsVdomUpdate=false
         * @protected
         */
        needsVdomUpdate: false,
        /**
         * The parent component id or document.body
         * @member {String} parentId='document.body'
         */
        parentId: 'document.body',
        /**
         * Array of Plugin Modules and / or config objects
         * @member {Array|null} plugins_=null
         * @protected
         */
        plugins_: null,
        /**
         * True in case the component is rendering the vnode
         * @member {Boolean} rendering_=false
         * @protected
         */
        rendering_: false,
        /**
         * Specify a role tag attribute for the vdom root.
         * See: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles
         * @member {String|null} role_=null
         */
        role_: null,
        /**
         * Set this to true for bulk updates.
         * Ensure to set it back to false afterwards.
         * @member {Boolean} silentVdomUpdate=false
         */
        silentVdomUpdate: false,
        /**
         * Style attributes added to this vdom root. see: getVdomRoot()
         * @member {Object} style_=null
         */
        style_: null,
        /**
         * Add tooltip config objects
         * See tooltip/Base.mjs
         * @member {Array|Object} tooltips_=null
         */
        tooltips_: null,
        /**
         * Add 'primary' and other attributes to make it
         * an outstanding design
         * @member {String|null} ui_=null
         */
        ui_: null,
        /**
         * The component vnode tree. Available after the component got rendered.
         * @member {Object} vnode_=null
         * @protected
         */
        vnode_: null,
        /**
         * Shortcut for style.width, defaults to px
         * @member {Number|String|null} width_=null
         */
        width_: null,
        /**
         * @member {String[]|null} wrapperCls_=null
         */
        wrapperCls_: null,
        /**
         * Top level style attributes. Useful in case getVdomRoot() does not point to the top level DOM node.
         * @member {Object|null} wrapperStyle_=null
         */
        wrapperStyle_: null,
        /**
         * The vdom markup for this component.
         * @member {Object} _vdom={}
         */
        _vdom: {}
    }

    /**
     * Apply component based listeners
     * @member {Object} listeners={}
     */
    get listeners() {
        return this._listeners || {};
    }
    set listeners(value) {
        this._listeners = value;
    }

    /**
     * True after the component render() method was called. Also fires the rendered event.
     * @member {Boolean} rendered=false
     * @protected
     */
    get rendered() {
        return this._rendered || false;
    }
    set rendered(value) {
        let me = this;

        me._rendered = value;

        if (value === true) {
            me.fire('rendered', me.id);
        }
    }

    /**
     * The setter will handle vdom updates automatically
     * @member {Object} vdom=this._vdom
     */
    get vdom() {
        return this._vdom;
    }
    set vdom(value) {
        this.afterSetVdom(value, value);
    }

    /**
     * Add a new cls to the vdomRoot
     * @param {String} value
     */
    addCls(value) {
        let cls = this.cls;

        NeoArray.add(cls, value);
        this.cls = cls;
    }

    /**
     * Convenience shortcut to add additional dom listeners
     * @param {Object|Object[]} value
     */
    addDomListeners(value) {
        if (!Array.isArray(value)) {
            value = [value];
        }

        let domListeners = this.domListeners;

        domListeners.push(...value);

        this.domListeners = domListeners;
    }

    /**
     * Either a string like 'color: red; background-color: blue;'
     * or an object containing style attributes
     * @param {String|Object} value
     * @returns {Object} all styles of this.el
     */
    addStyle(value) {
        if (typeof value === 'string') {
            value = Util.createStyleObject(value);
        }

        // todo: add a check if something has changed

        return this.style = Object.assign(this.style, value);
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__);
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
            vdomRoot.cls = [...value];
        } else {
            // we need to merge changes
            cls = NeoArray.union(me.wrapperCls, value);
            NeoArray.remove(cls, NeoArray.difference(oldValue, value));
            vdom.cls = cls;
        }

        if (me.isVdomUpdating || me.silentVdomUpdate) {
            me.needsVdomUpdate = true;
        } else if (me.mounted) {
            me.updateCls(value, oldValue, vdomRoot.id);
        }
    }

    /**
     * Triggered after any config got changed
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     * @protected
     */
    afterSetConfig(key, value, oldValue) {
        if (Neo.currentWorker.isUsingViewModels && oldValue !== undefined) {
            let binding = this.bind?.[key];

            if (binding?.twoWay) {
                this.getModel()?.setData(binding.key, value);
            }
        }
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
        this.cls = cls;
    }

    /**
     * Registers the domListeners inside the Neo.manager.DomEvent
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetDomListeners(value, oldValue) {
        let me = this;

        me.getController()?.parseDomListeners(me);

        DomEventManager.updateDomListeners(me, value, oldValue);
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
                    module : module.default,
                    appName: me.appName,
                    owner  : me,
                    ...me.dropZoneConfig
                });
            });
        }
    }

    /**
     * Triggered after the hasUnmountedVdomChanges config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHasUnmountedVdomChanges(value, oldValue) {
        if (value || (!value && oldValue)) {
            let parentIds = ComponentManager.getParentIds(this),
                i         = 0,
                len       = parentIds.length,
                parent;

            for (; i < len; i++) {
                parent = Neo.getComponent(parentIds[i]);

                if (parent) {
                    parent._hasUnmountedVdomChanges = value; // silent update
                }
            }
        }
    }

    /**
     * Triggered after the height config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetHeight(value, oldValue) {
        this.changeVdomRootKey('height', value);
    }

    /**
     * Triggered after the hidden config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHidden(value, oldValue) {
        if (!(!value && oldValue === undefined)) {
            this[value ? 'hide' : 'show']();
        }
    }

    /**
     * Triggered after the html config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetHtml(value, oldValue) {
        this.changeVdomRootKey('html', value);
    }

    /**
     * Triggered after the id config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);
        this.changeVdomRootKey('id', value);

        oldValue && ComponentManager.unregister(oldValue);
        ComponentManager.register(this);
    }

    /**
     * Triggered after the maxHeight config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMaxHeight(value, oldValue) {
        this.changeVdomRootKey('maxHeight', value);
    }

    /**
     * Triggered after the maxWidth config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMaxWidth(value, oldValue) {
        this.changeVdomRootKey('maxWidth', value);
    }

    /**
     * Triggered after the minHeight config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMinHeight(value, oldValue) {
        this.changeVdomRootKey('minHeight', value);
    }

    /**
     * Triggered after the minWidth config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetMinWidth(value, oldValue) {
        this.changeVdomRootKey('minWidth', value);
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            if (value) {
                me.hasBeenMounted = true;

                if (me.domListeners?.length > 0) {
                    // todo: the main thread reply of mount arrives after pushing the task into the queue which does not ensure the dom is mounted
                    setTimeout(() => {
                        DomEventManager.mountDomListeners(me);
                    }, 100);
                }

                me.fire('mounted', me.id);
            }
        }
    }

    /**
     * Triggered after the role config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRole(value, oldValue) {
        this.changeVdomRootKey('role', value);
    }

    /**
     * Triggered after the style config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetStyle(value, oldValue) {
        if (!(!value && oldValue === undefined)) {
            this.updateStyle(value, oldValue);
        }
    }

    /**
     * Triggered after the tooltips config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetTooltips(value, oldValue) {
        if (value) {
            let me = this;

            if (Neo.ns('Neo.tooltip.Base')) {
                me.createTooltips(value);
            } else {
                import('../tooltip/Base.mjs').then((module) => {
                    me.createTooltips(value);
                });
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

        NeoArray.remove(cls, `neo-${me.ntype}-${oldValue}`);

        if (value && value !== '') {
            NeoArray.add(cls, `neo-${me.ntype}-${value}`);
        }

        me.cls = cls;
    }

    /**
     * Triggered after the vdom config got changed
     * @param {Object} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetVdom(value, oldValue) {
        let me   = this,
            app  = Neo.apps[me.appName],
            vdom = value,
            listenerId;

        // It is important to keep the vdom tree stable to ensure that containers do not lose the references to their
        // child vdom trees. The if case should not happen, but in case it does, keeping the reference and merging
        // the content over seems to be the best strategy
        if (me._vdom !== vdom) {
            Logger.warn('vdom got replaced for: ' + me.id + '. Copying the content into the reference holder object');

            Object.keys(me._vdom).forEach(key => {
                delete me._vdom[key];
            });

            vdom = Object.assign(me._vdom, vdom);
        }

        if (me.silentVdomUpdate) {
            me.needsVdomUpdate = true;
        } else {
            if (!me.mounted && me.isConstructed && !me.hasRenderingListener && app?.rendering === true) {
                me.hasRenderingListener = true;

                listenerId = app.on('mounted', () => {
                    app.un('mounted', listenerId);

                    setTimeout(() => {
                        me.vnode && me.updateVdom(me.vdom, me.vnode);
                    }, 50);
                });
            } else if (me.mounted) {
                me.vnode && me.updateVdom(vdom, me.vnode);
            }

            me.hasUnmountedVdomChanges = !me.mounted && me.hasBeenMounted;
        }
    }

    /**
     * Triggered after the vnode config got changed
     * @param {Object} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetVnode(value, oldValue) {
        oldValue !== undefined && this.syncVnodeTree();
    }

    /**
     * Triggered after the width config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @protected
     */
    afterSetWidth(value, oldValue) {
        this.changeVdomRootKey('width', value);
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
            vdom     = me.vdom,
            vdomRoot = me.getVdomRoot(),
            cls      = me.vdom?.cls || [];

        if (vdom === vdomRoot) {
            // we need to merge changes
            cls = NeoArray.union(cls, value);
            NeoArray.remove(cls, NeoArray.difference(oldValue, value));
            vdom.cls = cls;

        } else {
            // we are not using a wrapper => cls & wrapperCls share the same node
            value = value ? value : [];

            oldValue && NeoArray.remove(cls, oldValue);
            NeoArray.add(cls, value);

            if (vdom) {
                vdom.cls = cls;
            }
        }

        if (me.isVdomUpdating || me.silentVdomUpdate) {
            me.needsVdomUpdate = true;
        } else if (me.mounted) {
            me.updateCls(value, oldValue);
        }
    }

    /**
     * Triggered after the wrapperStyle config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetWrapperStyle(value, oldValue) {
        if (!(!value && oldValue === undefined)) {
            let me   = this,
                vdom = me.vdom;

            if (!vdom.id) {
                vdom.style = value;
                me.update();
            } else {
                me.updateStyle(value, oldValue, vdom.id);
            }
        }
    }

    /**
     * Triggered when accessing the cls config
     * @param {String[]|null} value
     * @protected
     */
    beforeGetCls(value) {
        return value ? [...value]: [];
    }

    /**
     * Triggered when accessing the data config
     * Convenience shortcut which is expensive to use,
     * since it will generate a merged parent model data map.
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return this.getModel().getHierarchyData();
    }

    /**
     * Triggered when accessing the style config
     * @param {Object} value
     * @protected
     */
    beforeGetStyle(value) {
        return {...value};
    }

    /**
     * Triggered when accessing the wrapperCls config
     * @param {String[]|null} value
     * @protected
     */
    beforeGetWrapperCls(value) {
        return value ? [...value]: [];
    }

    /**
     * Triggered when accessing the wrapperStyle config
     * @param {Object} value
     * @protected
     */
    beforeGetWrapperStyle(value) {
        return {...Object.assign(this.vdom.style || {}, value)};
    }

    /**
     * Triggered before the cls config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    beforeSetCls(value, oldValue) {
        return NeoArray.union(value || [], this.baseCls);
    }

    /**
     * Triggered before the controller config gets changed.
     * Creates a controller.Component instance if needed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.controller.Component}
     * @protected
     */
    beforeSetController(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            return ClassSystemUtil.beforeSetInstance(value, null, {
                component: this
            });
        }

        return value;
    }

    /**
     * Triggered before the domListeners config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    beforeSetDomListeners(value, oldValue) {
        if (Neo.isObject(value)) {
            value = [value];
        }

        return value || [];
    }

    /**
     * Triggered before the hideMode config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
     beforeSetHideMode(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'hideMode');
    }

    /**
     * Triggered before the keys config gets changed.
     * Creates a KeyNavigation instance if needed.
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    beforeSetKeys(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            value = ClassSystemUtil.beforeSetInstance(value, KeyNavigation, {
                keys: value
            });
        }

        return value;
    }

    /**
     * Triggered before the model config gets changed.
     * Creates a model.Component instance if needed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.model.Component}
     * @protected
     */
    beforeSetModel(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            let me            = this,
                defaultValues = {component: me};

            if (me.modelData) {
                defaultValues.data = me.modelData;
            }

            return ClassSystemUtil.beforeSetInstance(value, 'Neo.model.Component', defaultValues);
        }

        return null;
    }

    /**
     * Triggered before the plugins config gets changed.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    beforeSetPlugins(value, oldValue) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                value[index] = ClassSystemUtil.beforeSetInstance(item, null, {
                    owner: this
                });
            });
        }

        return value;
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
            root[key] = value;
        } else {
            delete root[key];
        }

        me.update();
    }

    /**
     * Creates the tooltip instances
     * @param {Array|Object} value
     * @protected
     */
    createTooltips(value) {
        if (!Array.isArray(value)) {
            value = [value];
        }

        let me       = this,
            tooltips = [],
            tip;

        value.forEach(item => {
            // todo: check for existing tooltips

            tip = Neo.create('Neo.tooltip.Base', {
                appName    : me.appName,
                componentId: me.id,
                ...item
            });

            tooltips.push(tip);
        });

        me._tooltips = tooltips; // silent update
    }

    /**
     * Unregisters this instance from the ComponentManager
     * @param {Boolean} updateParentVdom=false true to remove the component from the parent vdom => real dom
     * @param {Boolean} silent=false true to update the vdom silently (useful for destroying multiple child items in a row)
     * todo: unregister events
     */
    destroy(updateParentVdom=false, silent=false) {
        let me          = this,
            parentId    = me.parentId,
            parent      = Neo.getComponent(parentId),
            parentModel = parent?.getModel(),
            parentVdom;

        me.domListeners = [];

        me.controller = null; // triggers destroy()

        me.reference && me.getController()?.removeReference(me); // remove own reference from parent controllers

        me.model = null; // triggers destroy()

        me.bind && parentModel?.removeBindings(me.id);

        me.plugins?.forEach(plugin => {
            plugin.destroy();
        });

        if (updateParentVdom && parentId) {
            if (parentId === 'document.body') {
                Neo.applyDeltas(me.appName, {action: 'removeNode', id: me.vdom.id});
            } else {
                parentVdom = parent.vdom;

                VDomUtil.removeVdomChild(parentVdom, me.vdom.id);
                parent[silent ? '_vdom' : 'vdom'] = parentVdom;
            }
        }

        ComponentManager.unregister(me);

        super.destroy();
    }

    /**
     * Convenience shortcut for Neo.manager.Component.down
     * @param {Object|String} config
     * @param {Boolean} returnFirstMatch=true
     * @returns {Neo.component.Base|null} The matching instance or null
     */
    down(config, returnFirstMatch=true) {
        return ComponentManager.down(this, config, returnFirstMatch);
    }

    /**
     * Calls focus() on the top level DOM node of this component or on a given node via id
     * @param {String} id=this.id
     */
    focus(id=this.id) {
        let me = this;

        // remote method access
        Neo.main.DomAccess.focus({
            id: id || me.id
        }).catch(err => {
            console.log('Error attempting to receive focus for component', err, me);
        });
    }

    /**
     * Convenience method to access the App this component belongs to
     * @returns {Neo.controller.Application}
     */
    getApp() {
        return Neo.apps[this.appName];
    }

    /**
     * Find an instance stored inside a config via optionally passing an ntype.
     * Returns this[configName] or the closest parent component with a match.
     * Used by getController() & getModel()
     * @param {String} configName
     * @param {String} [ntype]
     * @returns {Neo.core.Base|null}
     */
    getConfigInstanceByNtype(configName, ntype) {
        let me     = this,
            config = me[configName],
            parentComponent;

        if (config && (!ntype || ntype === config.ntype)) {
            return config;
        }

        if (me.parentId) {
            parentComponent = Neo.getComponent(me.parentId) || Neo.get(me.parentId);

            if (parentComponent) {
                return parentComponent.getConfigInstanceByNtype(configName, ntype);
            }
        }

        return null;
    }

    /**
     * Returns this.controller or the closest parent controller
     * @param {String} [ntype]
     * @returns {Neo.controller.Component|null}
     */
    getController(ntype) {
        return this.getConfigInstanceByNtype('controller', ntype);
    }

    /**
     * Convenience shortcut
     * @param {String[]|String} id=this.id
     * @param {String} appName=this.appName
     * @returns {Promise<*>}
     */
    getDomRect(id=this.id, appName=this.appName) {
        return Neo.main.DomAccess.getBoundingClientRect({appName, id});
    }

    /**
     * Returns this.model or the closest parent model
     * @param {String} [ntype]
     * @returns {Neo.model.Component|null}
     */
    getModel(ntype) {
        if (!Neo.currentWorker.isUsingViewModels) {
            return null;
        }

        return this.getConfigInstanceByNtype('model', ntype);
    }

    /**
     * Get the parent components as an array
     * @returns {Neo.component.Base[]}
     */
    getParents() {
        return ComponentManager.getParents(this);
    }

    /**
     * @param {Object|String} opts
     * @returns {Neo.plugin.Base|null}
     */
    getPlugin(opts) {
        opts = typeof opts !== 'string' ? opts : {id: opts};

        let me = this,
            hasMatch;

        for (const plugin of me.plugins || []) {
            hasMatch = true;

            for (const key in opts) {
                if (plugin[key] !== opts[key]) {
                    hasMatch = false;
                    break;
                }
            }

            if (hasMatch) {
                return plugin;
            }
        }

        return null;
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
            app, mainView, parentNodes;

        for (const item of me.cls || []) {
            if (item.startsWith(themeMatch)) {
                return item;
            }
        }

        app      = Neo.apps[me.appName];
        mainView = app?.mainView;

        if (mainView) {
            parentNodes = VDomUtil.getParentNodes(mainView.vdom, me.id);

            for (const node of parentNodes || []) {
                for (const item of node.cls || []) {
                    if (item.startsWith(themeMatch)) {
                        return item;
                    }
                }
            }
        }

        return Neo.config.themes?.[0];
    }

    /**
     * Search a vdom child node by id for a given vdom tree
     * @param {String} id
     * @param {Object} [vdom]
     * @returns {Object}
     */
    getVdomChild(id, vdom) {
        let node = VDomUtil.findVdomChild(vdom || this.vdom, id);
        return node?.vdom;
    }

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom;
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode;
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
            let removeFn = function() {
                me.unmount();
            }

            if (timeout) {
                setTimeout(removeFn, timeout);
            } else {
                removeFn();
            }
        } else {
            let style = me.style;
            style.visibility = 'hidden';
            me.style = style;
        }

        me._hidden = true;
    }

    /**
     *
     */
    init() {
        this.autoRender && this.render();
    }

    /**
     * We are using this method as a ctor hook here to add the initial model.Component & controller.Component parsing
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     */
    initConfig(config, preventOriginalConfig) {
        super.initConfig(config, preventOriginalConfig);

        let me = this;

        me.getController()?.parseConfig(me);
        me.getModel()     ?.parseConfig(me);
    }

    /**
     * Override this method to change the order configs are applied to this instance.
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @returns {Object} config
     */
    mergeConfig(...args) {
        let me     = this,
            config = super.mergeConfig(...args),

            // it should be possible to set custom configs for the vdom on instance level,
            // however there will be already added attributes (e.g. id), so a merge seems to be the best strategy.
            vdom = {...me._vdom || {}, ...config.vdom || {}};

        // avoid any interference on prototype level
        // does not clone existing Neo instances
        me._vdom = Neo.clone(vdom, true, true);

        me[Neo.isEmpty(config.style) ? '_style' : 'style'] = config.style;

        me.wrapperStyle = Neo.clone(config.wrapperStyle, false);

        delete config.style;
        delete config._vdom;
        delete config.vdom;
        delete config.wrapperStyle;

        return config;
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

            me.render(true);
        } else {
            await Neo.currentWorker.promiseMessage('main', {
                action     : 'mountDom',
                appName    : me.appName,
                id         : me.id,
                html       : me.vnode.outerHTML,
                parentId   : me.parentId,
                parentIndex: me.parentIndex
            });

            delete me.vdom.removeDom;

            await Neo.timeout(30);

            me.mounted = true;
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.keys?.register(this);
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
     * Gets called from the render() promise success handler
     * @param {Object} data
     * @param {Boolean} autoMount Mount the DOM after the vnode got created
     * @protected
     */
    onRender(data, autoMount) {
        let me  = this,
            app = Neo.apps[me.appName];

        me.rendering = false;

        // if app is a check to see if the Component got destroyed while rendering => before onRender got triggered
        if (app) {
            if (!app.rendered) {
                app.rendering = false;
                app.rendered  = true;
                app.fire('render');
            }

            me.vnode = data;

            let childIds  = ComponentManager.getChildIds(data),
                i         = 0,
                len       = childIds.length,
                child;

            for (; i < len; i++) {
                child = Neo.getComponent(childIds[i]);

                if (child) {
                    child.rendered = true;
                }
            }

            me._rendered = true; // silent update
            me.fire('rendered', me.id);

            // console.log('rendered: ' + me.appName + ' ' + me.id, me);

            if (autoMount) {
                me.mounted = true;

                if (!app.mounted) {
                    app.mounted = true;
                    app.fire('mounted');
                }
            }
        }
    }

    /**
     * Promise based vdom update
     * @param {Object} [vdom=this.vdom]
     * @param {Neo.vdom.VNode} [vnode= this.vnode]
     * @returns {Promise<any>}
     */
    promiseVdomUpdate(vdom=this.vdom, vnode=this.vnode) {
        let me    = this,
            _vdom = me.vdom;

        // todo: updateVdom() should handle this
        // It is important to keep the vdom tree stable to ensure that containers do not lose the references to their
        // child vdom trees. The if case should not happen, but in case it does, keeping the reference and merging
        // the content over seems to be the best strategy
        if (_vdom !== vdom) {
            Logger.warn('vdom got replaced for: ' + me.id + '. Copying the content into the reference holder object');

            Object.keys(_vdom).forEach(key => {
                delete _vdom[key];
            });

            vdom = Object.assign(me._vdom, vdom);
        }

        if (me.silentVdomUpdate) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (me.mounted) {
                me.updateVdom(vdom, vnode, resolve, reject);
            } else {
                me.update();
                resolve();
            }
        });
    }

    /**
     * Remove a cls from the vdomRoot
     * @param {String} value
     */
    removeCls(value) {
        let cls = this.cls;

        NeoArray.remove(cls, value);
        this.cls = cls;
    }

    /**
     * @param {Array|Object} value
     */
    removeDomListeners(value) {
        if (!Array.isArray(value)) {
            value = [value];
        }

        let me           = this,
            domListeners = me.domListeners,
            i, len;

        value.forEach(item => {
            i = 0;
            len = domListeners.length;

            for (; i < len; i++) {
                if (Neo.isEqual(item, domListeners[i])) {
                    domListeners.splice(i, 1);
                    break;
                }
            }
        });

        me.domListeners = domListeners;
    }

    /**
     * Either a string like 'color' or an array containing style attributes to remove
     * @param {String|Array} value camelCase only
     * @returns {Object} all styles of this.el
     */
    removeStyle(value) {
        if (typeof value === 'string') {
            value = [value];
        }

        let style    = this.style,
            doUpdate = false;

        Object.entries(style).forEach(key => {
            if (value.indexOf(key) > -1) {
                delete style[key];
                doUpdate = true;
            }
        });

        if (doUpdate) {
            this.style = style;
        }

        return style;
    }

    /**
     * Creates the vnode tree for this component and mounts the component in case
     * - you pass true for the mount param
     * - or the autoMount config is set to true
     * @param {Boolean} [mount] Mount the DOM after the vnode got created
     */
    render(mount) {
        let me            = this,
            autoMount     = mount || me.autoMount,
            app           = Neo.apps[me.appName],
            useVdomWorker = Neo.config.useVdomWorker;

        me.rendering = true;

        if (!app.rendered) {
            app.rendering = true;
        }

        if (me.vdom) {
            me.isVdomUpdating = true;

            Neo.vdom.Helper.create({
                appName    : me.appName,
                autoMount,
                parentId   : autoMount ? me.parentId    : undefined,
                parentIndex: autoMount ? me.parentIndex : undefined,
                ...me.vdom
            }).then(data => {
                me.onRender(data, useVdomWorker ? autoMount : false);
                me.isVdomUpdating = false;

                autoMount && !useVdomWorker && me.mount();
            });
        }
    }

    /**
     * Change multiple configs at once, ensuring that all afterSet methods get all new assigned values
     * @param {Object} values={}
     * @param {Boolean} [silent=false]
     * @returns {Promise<*>}
     */
    set(values={}, silent=false) {
        let me             = this,
            needsRendering = values.hidden === false && values.hidden !== me.hidden;

        me.silentVdomUpdate = true;

        super.set(values);

        me.silentVdomUpdate = false;

        if (silent || !me.needsVdomUpdate) {
            return Promise.resolve();
        } else {
            if (needsRendering) {
                me.show();
                return Promise.resolve();
            }

            return me.promiseVdomUpdate();
        }
    }

    /**
     * Convenience shortcut calling set() with the silent flag
     * @param {Object} values={}
     */
    setSilent(values={}) {
        return this.set(values, true);
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
                me.needsVdomUpdate = true;
            } else {
                !me.mounted && me.render(true)
            }
        } else {
            let style = me.style;
            delete style.visibility;
            me.style = style;
        }

        me._hidden = false;
    }

    /**
     * Placeholder method for util.VDom.syncVdomIds to allow overriding (disabling) it
     * @param {Neo.vdom.VNode} [vnode=this.vnode]
     * @param {Object} [vdom=this.vdom]
     */
    syncVdomIds(vnode=this.vnode, vdom=this.vdom) {
        VDomUtil.syncVdomIds(vnode, vdom);
    }

    /**
     * Placeholder method for util.VDom.syncVdomIds to allow overriding (disabling) it
     * @param {Neo.vdom.VNode} [vnode=this.vnode]
     */
    syncVnodeTree(vnode=this.vnode) {
        let me    = this,
            debug = false,
            childVnode, start;

        if (debug) {
            start = performance.now();
        }

        me.syncVdomIds();

        // delegate the latest node updates to all possible child components found inside the vnode tree
        ComponentManager.getChildren(me).forEach(component => {
            childVnode = VNodeUtil.findChildVnode(me.vnode, component.vdom.id);

            if (childVnode) {
                component._vnode = childVnode.vnode; // silent update

                if (!component.rendered) {
                    component._rendered = true;
                    component.fire('rendered', component.id);
                }

                component.mounted = true;
            } else {
                console.warn('syncVnodeTree: Could not replace the child vnode for', component.id);
            }
        });

        // console.log(me.vnode, me.mounted);

        // keep the vnode parent tree in sync
        ComponentManager.getParents(me).forEach((component, index) => {
            if (!me.vnode) {
                if (index === 0 && !VNodeUtil.removeChildVnode(component.vnode, me.id)) {
                    // This can fail, in case the vnode is already removed (not an issue, better safe than sorry)
                    // console.warn('syncVnodeTree: Could not remove the parent vnode for', me.id, component);
                }
            }

            // check for dynamically rendered components which get inserted into the component tree
            else if (index === 0 && me.vnode.outerHTML) {
                // console.log('dyn item', me.vnode, me.parentIndex);
                component.vnode.childNodes.splice(me.parentIndex || 0, 0, me.vnode);
            }

            else if (!VNodeUtil.replaceChildVnode(component.vnode, me.vnode.id, me.vnode)) {
                // todo: can happen for dynamically inserted container items
                // console.warn('syncVnodeTree: Could not replace the parent vnode for', me.vnode.id, component);
            }
        });

        if (debug) {
            let end = performance.now();
            console.log('syncVnodeTree', me.id, end - start);
        }
    }

    /**
     * Toggle a cls inside the vdomRoot of the component
     * @param {String} value
     * @param {Boolean} [add] Use this param to enforce an add() or remove() operation.
     */
    toggleCls(value, add) {
        let cls = this.cls;

        NeoArray.toggle(cls, value, add);
        this.cls = cls;
    }

    /**
     * Removes the component DOM
     */
    unmount() {
        let me = this;

        me.vdom.removeDom = true;

        me.mounted = false;

        Neo.currentWorker.promiseMessage('main', {
            action : 'updateDom',
            appName: me.appName,
            deltas : [{
                action: 'removeNode',
                id    : me.vdom.id
            }]
        }).catch(err => {
            console.log('Error attempting to unmount component', err, me);
        });
    }

    /**
     * Convenience shortcut for Neo.manager.Component.up
     * @param {Object|String} config
     * @returns {Neo.core.Base} The matching instance or null
     */
    up(config) {
        return ComponentManager.up(this.id, config);
    }

    /**
     *
     */
    update() {
        this.afterSetVdom(this.vdom, null);
    }

    /**
     * Delta updates for the cls config. Gets called after the cls config gets changed in case the component is mounted.
     * @param {String[]} cls
     * @param {String[]} oldCls
     * @param {String} id=this.id
     * @protected
     */
    updateCls(cls, oldCls, id=this.id) {
        let me          = this,
            vnode       = me.vnode,
            vnodeTarget = VNodeUtil.findChildVnode(me.vnode, {id})?.vnode;

        if (!Neo.isEqual(cls, oldCls)) {
            if (vnodeTarget) {
                vnodeTarget.className = cls; // keep the vnode in sync
                me.vnode = vnode;
            }

            Neo.applyDeltas(me.appName, {
                id,
                cls: {
                    add   : NeoArray.difference(cls, oldCls),
                    remove: NeoArray.difference(oldCls, cls)
                }
            });
        }
    }

    /**
     * Creates the style deltas for newValue & oldValue and applies them directly to the DOM.
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @param {String} [id=this.id]
     * @protected
     */
    updateStyle(value, oldValue, id=this.id) {
        let me    = this,
            delta = Style.compareStyles(value, oldValue),
            vdom  = VDomUtil.findVdomChild(me.vdom, id),
            vnode = me.vnode && VNodeUtil.findChildVnode(me.vnode, id),
            opts, vnodeStyle;

        if (delta) {
            if (!me.hasUnmountedVdomChanges) {
                me.hasUnmountedVdomChanges = !me.mounted && me.hasBeenMounted;
            }

            vdom.vdom.style = value; // keep the vdom in sync

            if (me.silentVdomUpdate) {
                me.needsVdomUpdate = true;
            } else if (me.mounted) {
                vnodeStyle = vnode.vnode.style;

                // keep the vnode in sync
                // we need the iteration since vdom shortcuts (height, width,...) live within the vnode style
                // using vnode.vnode.style = style would lose them.
                Object.entries(delta).forEach(([key, value]) => {
                    if (value === null) {
                        delete vnode.vnode.style[key];
                    } else {
                        vnodeStyle[key] = value;
                    }
                });

                opts = {
                    action: 'updateDom',
                    deltas: [{id, style: delta}]
                };

                if (Neo.currentWorker.isSharedWorker) {
                    opts.appName = me.appName;
                }

                Neo.currentWorker.sendMessage('main', opts);
            }
        }
    }

    /**
     * Gets called after the vdom config gets changed in case the component is already mounted (delta updates).
     * @param {Object} vdom
     * @param {Neo.vdom.VNode} vnode
     * @param {function} [resolve] used by promiseVdomUpdate()
     * @param {function} [reject] used by promiseVdomUpdate()
     * @protected
     */
    updateVdom(vdom, vnode, resolve, reject) {
        let me = this,
            deltas, opts;

        // console.log('updateVdom', me.id, Neo.clone(vdom, true), Neo.clone(vnode, true));
        // console.log('updateVdom', me.id, me.isVdomUpdating);

        if (me.isVdomUpdating) {
            me.needsVdomUpdate = true;
        } else {
            me.isVdomUpdating = true;

            opts = { vdom, vnode };

            if (Neo.currentWorker.isSharedWorker) {
                opts.appName = me.appName;
            }

            Neo.vdom.Helper.update(opts).then(data => {
                // console.log('Component vnode updated', data);
                me.vnode          = data.vnode;
                me.isVdomUpdating = false;

                deltas = data.deltas;

                if (!Neo.config.useVdomWorker && deltas.length > 0) {
                    Neo.applyDeltas(me.appName, deltas).then(() => {
                        resolve?.();

                        if (me.needsVdomUpdate) {
                            me.needsVdomUpdate = false;
                            me.vdom = me.vdom;
                        }
                    });
                } else {
                    resolve?.();

                    if (me.needsVdomUpdate) {
                        me.needsVdomUpdate = false;
                        me.vdom = me.vdom;
                    }
                }
            }).catch(err => {
                console.log('Error attempting to update component dom', err, me);
                me.isVdomUpdating = false;

                reject?.();
            });
        }
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

Neo.applyClassConfig(Base);

export default Base;
