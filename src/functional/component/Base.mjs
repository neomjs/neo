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

        me.removeDomEvents();

        // Remove any pending DOM event listeners that might not have been mounted
        me[pendingDomEventsSymbol] = [];

        ComponentManager.unregister(me);

        super.destroy()
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
                // Clear the old vdom properties
                for (const key in me.vdom) {
                    delete me.vdom[key]
                }

                // Assign the new properties
                Object.assign(me.vdom, newVdom);

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
