import Base             from '../../core/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import DomEvents        from '../../mixin/DomEvents.mjs';
import Effect           from '../../core/Effect.mjs';
import NeoArray         from '../../util/Array.mjs';
import Observable       from '../../core/Observable.mjs';
import VdomLifecycle    from '../../mixin/VdomLifecycle.mjs';

const
    activeDomListenersSymbol = Symbol.for('activeDomListeners'),
    hookIndexSymbol          = Symbol.for('hookIndex'),
    hooksSymbol              = Symbol.for('hooks'),
    pendingDomEventsSymbol   = Symbol.for('pendingDomEvents'),
    vdomToApplySymbol        = Symbol('vdomToApply');

/**
 * @class Neo.functional.component.Base
 * @extends Neo.core.Base
 * @mixes Neo.component.mixin.DomEvents
 * @mixes Neo.core.Observable
 * @mixes Neo.component.mixin.VdomLifecycle
 */
class FunctionalBase extends Base {
    static config = {
        /**
         * @member {String} className='Neo.functional.component.Base'
         * @protected
         */
        className: 'Neo.functional.component.Base',
        /**
         * @member {String} ntype='functional-component'
         * @protected
         */
        ntype: 'functional-component',
        /**
         * Custom CSS selectors to apply to the root level node of this component
         * @member {String[]} cls=null
         * @reactive
         */
        cls: null,
        /**
         * @member {Neo.core.Base[]} mixins=[DomEvents, Observable, VdomLifecycle]
         */
        mixins: [DomEvents, Observable, VdomLifecycle],
        /**
         * True after the component render() method was called. Also fires the rendered event.
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * @member {String|null} parentId_=null
         * @protected
         * @reactive
         */
        parentId_: null,
        /**
         * The vdom markup for this component.
         * @member {Object} vdom={}
         */
        vdom: {},
        /**
         * The custom windowIs (timestamp) this component belongs to
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * Neo component instances, which got defined inside createVdom()
     * @member {Map|null} childComponents=null
     */
    childComponents = null
    /**
     * Internal flag which will get set to true while a component is waiting for its mountedPromise
     * @member {Boolean} isAwaitingMount=false
     * @protected
     */
    isAwaitingMount = false
    /**
     * Internal Map to store the next set of components after the createVdom() Effect has run.
     * @member {Map|null} nextChildComponents=null
     * @private
     */
    #nextChildComponents = null

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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me   = this,
            opts = {configurable: true, enumerable: false, writable: true};

        Object.defineProperties(me, {
            [activeDomListenersSymbol]: {...opts, value: []},
            [hookIndexSymbol]         : {...opts, value: 0},
            [hooksSymbol]             : {...opts, value: []},
            [pendingDomEventsSymbol]  : {...opts, value: []},
            [vdomToApplySymbol]       : {...opts, value: null}
        });

        // Creates a reactive effect that re-executes createVdom() when dependencies change.
        me.vdomEffect = new Effect({
            fn: () => {
                me[hookIndexSymbol]        = 0;
                me[pendingDomEventsSymbol] = []; // Clear pending events for new render
                me[vdomToApplySymbol]      = me.createVdom(me, me.data)
            },
            componentId: me.id,
            subscriber : {
                id   : me.id,
                fn   : me.onEffectRunStateChange,
                scope: me
            }
        })
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
                me.initDomEvents();

                // Initial registration of DOM event listeners when component mounts
                me.applyPendingDomListeners();

                me.mountedPromiseResolve?.(this);
                delete me.mountedPromiseResolve
            } else { // unmount
                delete me._mountedPromise
            }
        }
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
            Neo.currentWorker.insertThemeFiles(value, me.__proto__)
        }

        me.childComponents?.forEach(childData => {
            childData.instance.windowId = value
        })

        // If a component gets moved into a different window, an update cycle might still be running.
        // Since the update might no longer get mapped, we want to re-enable this instance for future updates.
        if (oldValue) {
            me.isVdomUpdating = false
        }
    }

    /**
     * Applies the pending DOM event listeners and updates the active list.
     * @private
     */
    applyPendingDomListeners() {
        const
            me            = this,
            activeEvents  = me[activeDomListenersSymbol],
            pendingEvents = me[pendingDomEventsSymbol];

        if (pendingEvents.length > 0) {
            if (!Neo.isEqual(activeEvents, pendingEvents)) {
                if (activeEvents?.length > 0) {
                    // Remove old dynamic listeners
                    me.removeDomListeners(me[activeDomListenersSymbol])
                }

                me.addDomListeners([...pendingEvents]);

                me[activeDomListenersSymbol] = [...pendingEvents]
            }

            // Clear pending events for next `createVdom()` Effect run
            me[pendingDomEventsSymbol] = []
        }
    }

    /**
     * Override this method in your functional component to return its VDOM structure.
     * This method will be automatically re-executed when any of the component's configs change.
     * @param {Neo.functional.component.Base} config - Mental model: while it contains the instance, it makes it clear to access configs
     * @param {Object}                        data   - Convenience shortcut for accessing `state.Provider` data
     * @returns {Object} The VDOM structure for the component.
     */
    createVdom(config, data) {
        // This method should be overridden by subclasses
        return {}
    }

    /**
     *
     */
    destroy() {
        const me = this;

        me.vdomEffect?.destroy();

        // Destroy all classic components instantiated by this functional component
        me.childComponents?.forEach(childData => {
            childData.instance.destroy()
        });
        me.childComponents?.clear();

        me.removeDomEvents();

        // Remove any pending DOM event listeners that might not have been mounted
        me[pendingDomEventsSymbol] = null;

        ComponentManager.unregister(me);

        super.destroy()
    }

    /**
     * This method recursively compares the new VDOM config with the last applied config
     * for a given component instance and its sub-instances.
     * @param {Neo.core.Base} instance The component instance to update.
     * @param {Object} newConfig The new configuration object from the VDOM.
     * @param {Object} lastConfig The last applied configuration object.
     * @private
     */
    diffAndSet(instance, newConfig, lastConfig) {
        const deltaConfig = {};

        for (const key in newConfig) {
            const newValue = newConfig[key],
                  oldValue = lastConfig[key];

            if (!Neo.isEqual(newValue, oldValue)) {
                // If the config property is an object and it maps to a sub-component instance, recurse.
                if (Neo.typeOf(newValue) === 'Object' && Neo.typeOf(instance[key]) === 'NeoInstance') {
                    this.diffAndSet(instance[key], newValue, oldValue || {})
                } else {
                    // Otherwise, add it to the delta to be set on the current instance.
                    deltaConfig[key] = newValue
                }
            }
        }

        // Only call set() if there are actual changes for the current instance.
        if (Object.keys(deltaConfig).length > 0) {
            instance.set(deltaConfig)
        }
    }

    /**
     * This handler runs when the effect's `isRunning` state changes.
     * It runs outside the effect's tracking scope, preventing feedback loops.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    onEffectRunStateChange(value, oldValue) {
        // When the effect has just finished running...
        if (value === false) {
            const me      = this,
                  newVdom = me[vdomToApplySymbol];

            if (newVdom) {
                // Create a new map for components instantiated in this render cycle
                me.#nextChildComponents = new Map();

                // Process the newVdom to instantiate components
                // The parentId for these components will be the functional component's id
                const processedVdom = me.processVdomForComponents(newVdom, me.id);

                // Destroy components that are no longer present in the new VDOM
                if (me.childComponents?.size > 0) {
                    [...me.childComponents].forEach(([key, childData]) => {
                        if (!me.#nextChildComponents.has(key)) {
                            me.childComponents.delete(key);
                            childData.instance.destroy()
                        }
                    })
                }

                // If this component created other classic or functional components,
                // include their full vdom into the next update cycle.
                const oldKeys = me.childComponents ? new Set(me.childComponents.keys()) : new Set();
                let hasNewChildren = false;

                for (const newKey of me.#nextChildComponents.keys()) {
                    if (!oldKeys.has(newKey)) {
                        hasNewChildren = true;
                        break
                    }
                }

                if (hasNewChildren) {
                    // When new child components are created, we need to send their full VDOM
                    // to the vdom-worker, so they can get rendered.
                    // Subsequent updates will be granular via diffAndSet() => set() on the child.
                    me.updateDepth = -1;
                }

                // Update the main map of instantiated components
                me.childComponents = me.#nextChildComponents;

                // Clear the old vdom properties
                for (const key in me.vdom) {
                    delete me.vdom[key]
                }

                // Assign the new properties
                Object.assign(me.vdom, processedVdom); // Use processedVdom here

                me[vdomToApplySymbol] = null;

                const root = me.getVdomRoot();

                if (me.cls) {
                    root.cls = NeoArray.union(me.cls, root.cls)
                }

                if (me.id) {
                    root.id = me.id
                }

                me.updateVdom();

                // Update DOM event listeners based on the new render
                if (me.mounted) {
                    me.applyPendingDomListeners()
                }
            }
        }
    }

    /**
     * Recursively processes a VDOM node to instantiate components defined within it.
     * @param {Object} vdomTree The VDOM node to process.
     * @param {String} parentId The ID of the parent component (the functional component hosting it).
     * @param {Number} [parentIndex] The index of the vdomNode within its parent's children.
     * @returns {Object} The processed VDOM node, potentially replaced with a component reference.
     * @private
     */
    processVdomForComponents(vdomTree, parentId, parentIndex) {
        if (!vdomTree) {
            return vdomTree
        }

        // If it's already a component reference, no need to process further
        if (vdomTree.componentId) {
            return vdomTree
        }

        const me = this;

        // Check if it's a component definition (functional or classic)
        if (vdomTree.className || vdomTree.module || vdomTree.ntype) {
            // Components are reconciled based on their `id` property in the VDOM definition.
            // If no `id` is provided, a new instance will be created on every render.
            const componentKey = vdomTree.id;

            if (!componentKey) {
                console.error([
                    'Component definition in functional component VDOM is missing an "id". For stable reconciliation, ',
                    'especially in dynamic lists, provide a unique "id" property.'
                    ].join(''),
                    vdomTree
                )
            }

            let childData = me.childComponents?.get(componentKey),
                newConfig = {...vdomTree}, // Shallow copy
                instance;

            delete newConfig.className;
            delete newConfig.id;
            delete newConfig.module;
            delete newConfig.ntype;

            if (!childData) {
                me.childComponents ??= new Map();

                // Instantiate the component
                instance = Neo[(vdomTree.className || vdomTree.module) ? 'create' : 'ntype']({
                    ...vdomTree,
                    parentId,
                    parentIndex,
                    windowId: me.windowId
                });
            } else {
                instance = childData.instance;

                // Recursively diff and set configs
                this.diffAndSet(instance, newConfig, childData.lastConfig);
            }

            // Add to the new map for tracking in this render cycle
            me.#nextChildComponents.set(componentKey, {
                instance,
                lastConfig: newConfig
            });

            // Replace the definition with a reference using the component's own method
            return instance.createVdomReference();
        }

        // Recursively process children
        if (vdomTree.cn && Array.isArray(vdomTree.cn)) {
            vdomTree.cn = vdomTree.cn.map((child, index) =>
                me.processVdomForComponents(child, parentId, index)
            )
        }

        return vdomTree
    }

    /**
     * Change multiple configs at once, ensuring that all afterSet methods get all new assigned values
     * @param {Object} values={}
     * @param {Boolean} silent=false
     * @returns {Promise<*>}
     */
    set(values={}, silent=false) {
        let me = this;

        me.silentVdomUpdate = true;

        super.set(values);

        me.silentVdomUpdate = false;

        if (silent || !me.needsVdomUpdate) {
            return Promise.resolve()
        }

        return me.promiseUpdate()
    }
}

export default Neo.setupClass(FunctionalBase);
