import Base             from '../core/Base.mjs';
import ClassSystemUtil  from '../util/ClassSystem.mjs';
import ComponentManager from '../manager/Component.mjs';
import DomEvents        from '../mixin/DomEvents.mjs';
import Observable       from '../core/Observable.mjs';
import VdomLifecycle    from '../mixin/VdomLifecycle.mjs';
import VDomUpdate       from '../manager/VDomUpdate.mjs';
import VNodeUtil        from '../util/VNode.mjs';

const
    closestController   = Symbol.for('closestController'),
    closestProvider     = Symbol.for('closestProvider'),
    twoWayBindingSymbol = Symbol.for('twoWayBinding');

/**
 * @class Neo.component.Abstract
 * @extends Neo.core.Base
 * @mixes Neo.component.mixin.DomEvents
 * @mixes Neo.core.Observable
 * @mixes Neo.component.mixin.VdomLifecycle
 */
class Abstract extends Base {
    static config = {
        /**
         * @member {String} className='Neo.component.Abstract'
         * @protected
         */
        className: 'Neo.component.Abstract',
        /**
         * @member {String} ntype='abstract-component'
         * @protected
         */
        ntype: 'abstract-component',
        /**
         * Additional namespaces to load theme files for.
         * @member {String[]|null} additionalThemeFiles=null
         * @example ['AgentOSStrategy.view.Viewport']
         */
        additionalThemeFiles: null,
        /**
         * The name of the App this component belongs to
         * @member {String|null} appName_=null
         * @reactive
         */
        appName_: null,
        /**
         * Bind configs to state.Provider data properties.
         * @member {Object|null} bind=null
         */
        bind: null,
        /**
         * Custom CSS selectors to apply to the root level node of this component
         * @member {String[]} cls_=null
         * @reactive
         */
        cls_: null,
        /**
         * Convenience shortcut to access the data config of the closest state.Provider.
         * Read only.
         * @member {Object} data_=null
         * @protected
         * @reactive
         */
        data_: null,
        /**
         * Disabled components will get the neo-disabled cls applied and won't receive DOM events
         * @member {Boolean} disabled_=false
         * @reactive
         */
        disabled_: false,
        /**
         * @member {Neo.core.Base[]} mixins=[DomEvents, Observable, VdomLifecycle]
         */
        mixins: [DomEvents, Observable, VdomLifecycle],
        /**
         * Override specific stateProvider data properties.
         * This will merge the content.
         * @member {Object|null} modelData=null
         */
        modelData: null,
        /**
         * True after the component initVnode() method was called. Also fires the rendered event.
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * If the parentId does not match a neo component id, you can manually set this value for finding
         * view controllers or state providers.
         * Use case: manually dropping components into a vdom structure
         * @member {Neo.component.Base|null} parentComponent_=null
         * @protected
         * @reactive
         */
        parentComponent_: null,
        /**
         * The parent component id or document.body
         * @member {String} parentId_='document.body'
         * @reactive
         */
        parentId_: 'document.body',
        /**
         * @member {Boolean} saveScrollPosition=true
         */
        saveScrollPosition: true,
        /**
         * Optionally add a state.Provider to share state data with child components
         * @member {Object|null} stateProvider_=null
         * @reactive
         */
        stateProvider_: null,
        /**
         * The custom windowIs (timestamp) this component belongs to
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * Internal flag which will get set to true while a component is waiting for its mountedPromise
     * @member {Boolean} isAwaitingMount=false
     * @protected
     */
    isAwaitingMount = false

    /**
     * Convenience shortcut to access the App this component belongs to
     * @returns {Neo.controller.Application|null}
     */
    get app() {
        // We need Neo.appsByName as a fallback for Playwright-based unit testing
        return Neo.apps[this.windowId] || Neo.appsByName[this.appName]?.[0] || null
    }

    /**
     * A Promise that resolves when the component is mounted to the DOM.
     * This provides a convenient way to wait for the component to be fully
     * available and interactive before executing subsequent logic.
     *
     * It also handles unmounting by resetting the promise, so it can be safely
     * awaited again if the component is remounted.
     * @returns {Promise<Neo.component.Base>}
     */
    get mountedPromise() {
        let me = this;

        if (!me._mountedPromise) {
            me._mountedPromise = new Promise(resolve => {
                if (me.mounted) {
                    resolve(me);
                } else {
                    me.mountedPromiseResolve = resolve
                }
            })
        }

        return me._mountedPromise
    }

    /**
     * Convenience method to access the parent component
     * @returns {Neo.component.Base|null}
     */
    get parent() {
        let me = this;

        return me.parentComponent || (me.parentId === 'document.body' ? null : Neo.getComponent(me.parentId))
    }

    /**
     * Triggered after any config got changed
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     * @protected
     */
    afterSetConfig(key, value, oldValue) {
        let me = this;

        if (Neo.isUsingStateProviders && me[twoWayBindingSymbol]) {
            // When a component config is updated by its state provider, this flag is set to the config's key.
            // This prevents circular updates in two-way data bindings by skipping the push back to the state provider.
            if (me._skipTwoWayPush === key) {
                return;
            }
            let binding = me.bind?.[key];

            if (binding?.twoWay) {
                this.getStateProvider()?.setData(binding.key, value)
            }
        }
    }

    /**
     * Triggered after the id config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        oldValue && ComponentManager.unregister(oldValue);
        value    && ComponentManager.register(this)
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined) {
            const me = this;

            if (value) { // mount
                me.initDomEvents?.();
                me.mountedPromiseResolve?.(this);
                delete me.mountedPromiseResolve;

                // When a component becomes mounted, it might have pending VDOM update promises
                // (e.g. from a set() call that was deferred because the component wasn't mounted yet).
                // If the mount happened because a Parent component updated (implicitly covering this component),
                // this component's own pending update cycle might be skipped or not yet triggered.
                // We explicitly execute the callbacks here to ensure those pending promises are resolved immediately
                // upon mount, preventing deadlocks where code awaits a VDOM update that effectively already happened.
                VDomUpdate.executeCallbacks(me.id)
            } else { // unmount
                delete me._mountedPromise
            }
        }
    }

    /**
     * Triggered after the stateProvider config got changed
     * @param {Neo.state.Provider} value
     * @param {Object|Neo.state.Provider|null} oldValue
     * @protected
     */
    afterSetStateProvider(value, oldValue) {
        value?.createBindings(this)
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        const me = this;

        if (value) {
            me.controller    && (me.controller.windowId    = value);
            me.stateProvider && (me.stateProvider.windowId = value);

            Neo.currentWorker.insertThemeFiles(value, me.__proto__)
        }

        // If a component gets moved into a different window, an update cycle might still be running.
        // Since the update might no longer get mapped, we want to re-enable this instance for future updates.
        if (oldValue) {
            me.isVdomUpdating = false
        }
    }

    /**
     * Triggered when accessing the data config
     * Convenience shortcut which is expensive to use, since it will generate a merged parent state providers data map.
     * @param {Object} value
     * @protected
     */
    beforeGetData(value) {
        return this.getStateProvider()?.getHierarchyData()
    }

    /**
     * Triggered before the stateProvider config gets changed.
     * Creates a state.Provider instance if needed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Neo.state.Provider}
     * @protected
     */
    beforeSetStateProvider(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            let me            = this,
                defaultValues = {component: me, windowId: me.windowId};

            if (me.modelData) {
                defaultValues.data = me.modelData
            }

            return ClassSystemUtil.beforeSetInstance(value, 'Neo.state.Provider', defaultValues)
        }

        return null
    }

    /**
     *
     */
    destroy() {
        this.removeDomEvents();
        ComponentManager.unregister(this);
        this.stateProvider = null; // triggers destroy()
        super.destroy()
    }

    /**
     * Find an instance stored inside a config via optionally passing a ntype.
     * Returns this[configName] or the closest parent component with a match.
     * Used by getController() & getStateProvider()
     * @param {String} configName
     * @param {String} [ntype]
     * @returns {Neo.core.Base|null}
     */
    getConfigInstanceByNtype(configName, ntype) {
        let me                = this,
            config            = me[configName],
            {parentComponent} = me;

        if (config && (!ntype || ntype === config.ntype)) {
            return config
        }

        if (!parentComponent && me.parentId) {
            parentComponent = me.parent || Neo.get(me.parentId);
        }

        if (parentComponent) {
            // todo: We need ?. until functional.component.Base supports controllers
            return parentComponent.getConfigInstanceByNtype?.(configName, ntype)
        }

        return null
    }

    /**
     * Convenience shortcut
     * @param args
     * @returns {*}
     */
    getState(...args) {
        return this.getStateProvider().getData(...args)
    }

    /**
     * Returns this.stateProvider or the closest parent stateProvider
     * @param {String} [ntype]
     * @returns {Neo.state.Provider|null}
     */
    getStateProvider(ntype) {
        if (!Neo.isUsingStateProviders) {
            return null
        }

        let me = this,
            provider;

        if (!ntype) {
            provider = me[closestProvider];

            if (provider) {
                return provider
            }
        }

        provider = me.getConfigInstanceByNtype('stateProvider', ntype);

        if (!ntype) {
            me[closestProvider] = provider
        }

        return provider
    }

    /**
     * @param args
     */
    initConfig(...args) {
        super.initConfig(...args);
        this.getStateProvider()?.createBindings(this)
    }

    /**
     * @param {Object} data
     */
    onScrollCapture(data) {
        let me    = this,
            vnode;

        if (me.vnode) {
            vnode = VNodeUtil.getById(me.vnode, data.target.id);

            if (vnode) {
                // Directly updating the persistent vnode state (plain object).
                // This does not trigger a VDOM update, but ensures the state is preserved
                // for future re-renders (e.g. unmount/remount).
                vnode.scrollTop  = data.scrollTop;
                vnode.scrollLeft = data.scrollLeft
            }
        }
    }

    /**
     * Change multiple configs at once, ensuring that all afterSet methods get all new assigned values
     * @param {Object} values={}
     * @param {Boolean} silent=false
     * @returns {Promise<*>}
     */
    set(values={}, silent=false) {
        const
            me        = this,
            wasHidden = me.hidden;

        me.setSilent(values);

        if (!silent && me.needsVdomUpdate) {
            if (wasHidden && !me.hidden) {
                me.show?.(); // show() is not part of the abstract base class
                return Promise.resolve()
            }

            return me.promiseUpdate()
        }

        return Promise.resolve()
    }

    /**
     * A silent version of set(), which does not trigger a vdom update at the end.
     * Useful for batching multiple config changes.
     * @param {Object} values={}
     */
    setSilent(values={}) {
        this.silentVdomUpdate = true;
        super.set(values);
        this.silentVdomUpdate = false
    }

    /**
     * Convenience shortcut
     * @param args
     */
    setState(...args) {
        this.getStateProvider().setData(...args)
    }
}

export default Neo.setupClass(Abstract);
