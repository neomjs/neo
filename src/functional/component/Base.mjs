import Base             from '../../core/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import DomEvents        from '../../mixin/DomEvents.mjs';
import Effect           from '../../core/Effect.mjs';
import Observable       from '../../core/Observable.mjs';
import VdomLifecycle    from '../../mixin/VdomLifecycle.mjs';

const
    activeDomListenersSymbol = Symbol.for('activeDomListeners'),
    hookIndexSymbol        = Symbol.for('hookIndex'),
    hooksSymbol            = Symbol.for('hooks'),
    pendingDomEventsSymbol = Symbol.for('pendingDomEvents'),
    vdomToApplySymbol      = Symbol('vdomToApply');

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
        vdom: {}
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
        me.vdomEffect = new Effect(() => {
            me[hookIndexSymbol]        = 0;
            me[pendingDomEventsSymbol] = []; // Clear pending events for new render
            me[vdomToApplySymbol]      = me.createVdom(me, me.data)
        }, me.id);

        // We subscribe to the effect's isRunning state.
        // The handler runs *outside* the effect's tracking scope.
        me.vdomEffect.isRunning.subscribe({
            id   : me.id,
            fn   : me.onEffectRunStateChange,
            scope: me
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
            if (value) {
                const me = this

                me.initDomEvents();

                // Initial registration of DOM event listeners when component mounts
                me.applyPendingDomListeners()
            }
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
                console.log('Applying pending DOM listeners', pendingEvents);
                me.addDomListeners([...pendingEvents]);

                me[activeDomListenersSymbol] = [...pendingEvents];
                me[pendingDomEventsSymbol]   = [] // Clear pending events for next render
            }
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
        me._instantiatedComponents.forEach(component => {
            component.destroy();
        });
        me._instantiatedComponents.clear();

        me.removeDomEvents();

        // Remove any pending DOM event listeners that might not have been mounted
        me[pendingDomEventsSymbol] = [];

        ComponentManager.unregister(me);

        super.destroy()
    }

    /**
     * Recursively processes a VDOM node to instantiate components defined within it.
     * @param {Object} vdomNode The VDOM node to process.
     * @param {String} parentId The ID of the parent component (the functional component hosting it).
     * @param {Number} [parentIndex] The index of the vdomNode within its parent's children.
     * @returns {Object} The processed VDOM node, potentially replaced with a component reference.
     * @private
     */
    processVdomForComponents(vdomNode, parentId, parentIndex) {
        if (!vdomNode) {
            return vdomNode;
        }

        // If it's already a component reference, no need to process further
        if (vdomNode.componentId) {
            return vdomNode;
        }

        // Check if it's a component definition (functional or classic)
        if (vdomNode.module || vdomNode.ntype) {
            // Components are reconciled based on their `id` property in the VDOM definition.
            // If no `id` is provided, a new instance will be created on every render.
            const componentKey = vdomNode.id;

            if (!componentKey) {
                console.warn('Component definition in functional component VDOM is missing an "id". For stable reconciliation, especially in dynamic lists, provide a unique "id" property.', vdomNode);
            }

            // If the component already exists (e.g., from a previous render cycle), reuse it
            let newComponent = this._instantiatedComponents?.get(componentKey);

            if (!newComponent) {
                this._instantiatedComponents ??= new Map();


                // Instantiate the component
                newComponent = Neo[vdomNode.module ? 'create' : 'ntype']({
                    ...vdomNode,
                    parentId: parentId,
                    parentIndex: parentIndex // Pass the index to the component
                });
            }

            // Add to the new map for tracking in this render cycle
            this._newlyInstantiatedComponents.set(componentKey, newComponent);

            // Replace the definition with a reference using the component's own method
            return newComponent.createVdomReference();
        }

        // Recursively process children
        if (vdomNode.cn && Array.isArray(vdomNode.cn)) {
            vdomNode.cn = vdomNode.cn.map((child, index) =>
                this.processVdomForComponents(child, parentId, index)
            );
        }

        return vdomNode;
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
                me._newlyInstantiatedComponents = new Map();

                // Process the newVdom to instantiate components
                // The parentId for these components will be the functional component's id
                const processedVdom = me.processVdomForComponents(newVdom, me.id);

                // Destroy components that are no longer present in the new VDOM
                me._instantiatedComponents?.forEach((component, key) => {
                    if (!me._newlyInstantiatedComponents.has(key)) {
                        component.destroy();
                    }
                });

                // Update the main map of instantiated components
                me._instantiatedComponents = me._newlyInstantiatedComponents;

                // Clear the old vdom properties
                for (const key in me.vdom) {
                    delete me.vdom[key]
                }

                // Assign the new properties
                Object.assign(me.vdom, processedVdom); // Use processedVdom here

                me[vdomToApplySymbol] = null;

                const root = me.getVdomRoot();

                if (me.id) {
                    root.id = me.id
                }

                me.updateVdom();

                // Update DOM event listeners based on the new render
                if (me.mounted) {
                    if (!Neo.isEqual(me[pendingDomEventsSymbol], me[activeDomListenersSymbol])) {
                        me.removeDomListeners(me[activeDomListenersSymbol]); // Remove old dynamic listeners
                        me._applyPendingDomListeners(); // Add new dynamic listeners and update active list
                    } else {
                        me[pendingDomEventsSymbol] = []; // Clear pending events even if no change
                    }
                }
            }
        }
    }
}

export default Neo.setupClass(FunctionalBase);
