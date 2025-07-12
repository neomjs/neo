import Base             from '../../core/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import Effect           from '../../core/Effect.mjs';
import Observable       from '../../core/Observable.mjs';
import VdomLifecycle    from '../../mixin/VdomLifecycle.mjs';

const
    hookIndexSymbol   = Symbol.for('hookIndex'),
    hooksSymbol       = Symbol.for('hooks'),
    vdomToApplySymbol = Symbol('vdomToApply');

/**
 * @class Neo.functional.component.Base
 * @extends Neo.core.Base
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
         * @member {Neo.core.Base[]} mixins=[Observable, VdomLifecycle]
         */
        mixins: [Observable, VdomLifecycle],
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

        let me = this;

        me.vdomEffectIsRunning = false;

        Object.defineProperties(me, {
            [hookIndexSymbol]: {
                configurable: true,
                enumerable  : false,
                value       : 0,
                writable    : true
            },
            [hooksSymbol]: {
                configurable: true,
                enumerable: false,
                value     : [],
                writable  : true
            },
            [vdomToApplySymbol]: {
                configurable: true,
                enumerable  : false,
                value       : null,
                writable    : true
            }
        });

        // Creates a reactive effect that re-executes createVdom() when dependencies change.
        me.vdomEffect = new Effect(() => {
            me[hookIndexSymbol] = 0;

            // This runs inside the effect's tracking scope.
            me[vdomToApplySymbol] = me.createVdom(me, me.data)
        }, me.id);

        // We subscribe to the effect's isRunning state.
        // The handler runs *outside* the effect's tracking scope.
        me.vdomEffect.isRunning.subscribe({
            id   : me.id,
            fn   : me.onEffectRunStateChange,
            scope: me
        });
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
        this.vdomEffect?.destroy();

        ComponentManager.unregister(this);

        super.destroy()
    }

    /**
     * This handler runs when the effect's `isRunning` state changes.
     * It runs outside the effect's tracking scope, preventing feedback loops.
     * @param {Boolean} newValue
     * @param {Boolean} oldValue
     */
    onEffectRunStateChange(newValue, oldValue) {
        // When the effect has just finished running...
        if (newValue === false) {
            const me      = this,
                  newVdom = me[vdomToApplySymbol];

            if (newVdom) {
                // Clear the old vdom properties
                for (const key in me.vdom) {
                    if (Object.prototype.hasOwnProperty.call(me.vdom, key)) {
                        delete me.vdom[key];
                    }
                }

                // Assign the new properties
                Object.assign(me.vdom, newVdom);

                const root = me.getVdomRoot();

                if (me.id) {
                    root.id = me.id;
                }

                // We schedule the update in a microtask to ensure the current reactive
                // notification chain is fully completed before we start a new update cycle.
                // This prevents a recursive loop where updateVdom() triggers a reactive
                // setter, which could cause this same effect to run again immediately.
                Promise.resolve().then(() => {
                    me.updateVdom()
                })
            }
        }
    }
}

export default Neo.setupClass(FunctionalBase);
