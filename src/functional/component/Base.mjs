import Abstract         from '../../component/Abstract.mjs';
import Effect           from '../../core/Effect.mjs';
import NeoArray         from '../../util/Array.mjs';
import {isHtmlTemplate} from '../util/html.mjs';

const
    activeDomListenersSymbol = Symbol.for('activeDomListeners'),
    hookIndexSymbol          = Symbol.for('hookIndex'),
    hooksSymbol              = Symbol.for('hooks'),
    pendingDomEventsSymbol   = Symbol.for('pendingDomEvents'),
    vdomToApplySymbol        = Symbol('vdomToApply');

/**
 * @class Neo.functional.component.Base
 * @extends Neo.component.Abstract
 */
class FunctionalBase extends Abstract {
    static config = {
        /**
         * @member {String} className='Neo.functional.component.Base'
         * @protected
         */
        className: 'Neo.functional.component.Base',
        /**
         * @member {Boolean} enableHtmlTemplates_=false
         * @reactive
         * Set this to true to enable using tagged template literals for VDOM creation
         * via the render() method. This will lazy load the html parser.
         */
        enableHtmlTemplates_: false,
        /**
         * @member {String} ntype='functional-component'
         * @protected
         */
        ntype: 'functional-component',
        /**
         * The vdom markup for this component.
         * @member {Object} vdom={}
         */
        vdom: {}
    }

    /**
     * Neo component instances, which got defined inside createVdom()
     * @member {Map|null} childComponents=null
     */
    childComponents = null
    /**
     * @member {Neo.functional.util.HtmlTemplateProcessor|null} htmlTemplateProcessor=null
     * @private
     */
    htmlTemplateProcessor = Neo.ns('Neo.functional.util.HtmlTemplateProcessor')
    /**
     * Internal Map to store the next set of components after the createVdom() Effect has run.
     * @member {Map|null} nextChildComponents=null
     * @private
     */
    #nextChildComponents = null

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
                me[vdomToApplySymbol]      = me.createVdom(me)
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
     * Triggered after the isReady config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        const me = this;

        if (value && me.missedReadyState) {
            me.vdomEffect.run();
            delete me.missedReadyState
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && oldValue !== undefined) {
            // Initial registration of DOM event listeners when component mounts
            this.applyPendingDomListeners()
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

        this.childComponents?.forEach(childData => {
            childData.instance.windowId = value
        })
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
     * A lifecycle hook that runs after a state change has been detected but before the
     * VDOM update is dispatched. It provides a dedicated place for logic that needs to
     * execute before rendering, such as calculating derived data or caching values.
     *
     * You can prevent the VDOM update by returning `false` from this method. This is
     * useful for advanced cases where you might want to manually trigger a different
     * update after modifying other component configs.
     *
     * **IMPORTANT**: Do not change the value of any config that is used as a dependency
     * within the `createVdom` method from inside this hook, as it will cause an
     * infinite update loop. This hook is for one-way data flow, not for triggering
     * cascading reactive changes.
     *
     * @returns {Boolean|undefined} Return `false` to cancel the upcoming VDOM update.
     * @example
     * beforeUpdate() {
     *     // Perform an expensive calculation and cache the result on the instance
     *     this.processedData = this.processRawData(this.rawData);
     *
     *     // Example of conditionally cancelling an update
     *     if (this.processedData.length === 0 && this.vdom.cn?.length === 0) {
     *         return false; // Don't re-render if there's nothing to show
     *     }
     * }
     */
    beforeUpdate() {
        // This method can be overridden by subclasses
    }

    /**
     * This method is called by the HtmlTemplateProcessor after the async parsing is complete.
     * It then continues the component update lifecycle.
     * @param {Object} parsedVdom The VDOM object received from the parser addon.
     * @protected
     */
    continueUpdateWithVdom(parsedVdom) {
        const me = this;

        // Create a new map for components instantiated in this render cycle
        me.#nextChildComponents = new Map();

        // Process the newVdom to instantiate components
        // The parentId for these components will be the functional component's id
        const processedVdom = me.processVdomForComponents(parsedVdom, me.id);

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

        // Re-hydrate the new vdom with stable IDs from the previous vnode tree.
        // This is crucial for functional components where the vdom is recreated on every render,
        // ensuring the diffing algorithm can track nodes correctly.
        me.syncVdomIds();

        if (me.beforeUpdate() !== false) {
            me.updateVdom()
        }

        // Update DOM event listeners based on the new render
        if (me.mounted) {
            me.applyPendingDomListeners()
        }
    }

    /**
     * Override this method in your functional component to return its VDOM structure.
     * This method will be automatically re-executed when any of the component's configs change.
     * To access data from a state provider, use `config.data`.
     * @param {Neo.functional.component.Base} config - Mental model: while it contains the instance, it makes it clear to access configs
     * @returns {Object} The VDOM structure for the component.
     */
    createVdom(config) {
        const me = this;

        if (me.enableHtmlTemplates && typeof me.render === 'function') {
            return me.render(config)
        }

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

        // Remove any pending DOM event listeners that might not have been mounted
        me[pendingDomEventsSymbol] = null;

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
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.enableHtmlTemplates) {
            if (!Neo.ns('Neo.functional.util.HtmlTemplateProcessor')) {
                const module = await import('../util/HtmlTemplateProcessor.mjs');
                this.htmlTemplateProcessor = module.default
            }
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
                // If the result is an HtmlTemplate, hand it off to the processor
                if (newVdom[isHtmlTemplate]) {
                    if (me.htmlTemplateProcessor) {
                        me.htmlTemplateProcessor.process(newVdom, me)
                    } else {
                        me.missedReadyState = true;
                        // By calling this with an empty object, we ensure that the parent container
                        // renders a placeholder DOM node for this component, which we can then
                        // populate later once the template processor is ready.
                        me.continueUpdateWithVdom({})
                    }
                    return // Stop execution, the processor will call back
                }

                // Continue with the standard JSON-based VDOM update
                me.continueUpdateWithVdom(newVdom)
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
        if (vdomTree.className || vdomTree.module || (vdomTree.ntype && vdomTree.ntype !== 'vdomtext')) {
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
}

export default Neo.setupClass(FunctionalBase);
