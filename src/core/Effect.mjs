import EffectManager     from './EffectManager.mjs';
import EffectBatchManager from './EffectBatchManager.mjs';
import IdGenerator        from './IdGenerator.mjs';

/**
 * Creates a reactive effect that automatically tracks its dependencies and re-runs when any of them change.
 * This is a lightweight, plain JavaScript class for performance.
 * It serves as a core reactive primitive, enabling automatic and dynamic dependency tracking.
 * @class Neo.core.Effect
 */
class Effect {
    /**
     * A Map containing Config instances as keys and their cleanup functions as values.
     * @member {Map} dependencies=new Map()
     * @protected
     */
    dependencies = new Map()
    /**
     * The function to execute.
     * @member {Function|null} _fn=null
     */
    _fn = null
    /**
     * The unique identifier for this effect instance.
     * @member {String|null}
     */
    id = IdGenerator.getId('effect')
    /**
     * @member {Boolean}
     * @protected
     */
    isDestroyed = false
    /**
     * @member {Boolean}
     * @protected
     */
    isRunning = false

    /**
     * @member fn
     */
    get fn() {
        return this._fn
    }
    set fn(value) {
        this._fn = value;
        // Assigning a new function to `fn` automatically triggers a re-run.
        // This ensures that the effect immediately re-evaluates its dependencies
        // based on the new function's logic, clearing old dependencies and establishing new ones.
        this.run()
    }

    /**
     * @param {Object} config
     * @param {Function} config.fn The function to execute for the effect.
     */
    constructor({fn}) {
        this.fn = fn
    }

    /**
     * Cleans up all subscriptions and destroys the effect.
     */
    destroy() {
        const me = this;

        me.dependencies.forEach(cleanup => cleanup());
        me.dependencies.clear();
        me.isDestroyed = true
    }

    /**
     * Executes the effect function, tracking its dependencies.
     * This is called automatically on creation and whenever a dependency changes.
     * The dynamic re-tracking ensures the effect always reflects its current dependencies,
     * even if the logic within `fn` changes conditionally.
     * @protected
     */
    run() {
        const me = this;

        if (me.isDestroyed || me.isRunning) return;

        if (EffectBatchManager.isBatchActive()) {
            EffectBatchManager.queueEffect(me);
            return
        }

        me.isRunning = true;

        me.dependencies.forEach(cleanup => cleanup());
        me.dependencies.clear();

        EffectManager.push(me);

        try {
            me.fn()
        } finally {
            EffectManager.pop();
            me.isRunning = false;
        }
    }

    /**
     * Adds a `Neo.core.Config` instance as a dependency for this effect.
     * @param {Neo.core.Config} config The config instance to subscribe to.
     * @protected
     */
    addDependency(config) {
        const me = this;

        // Only add if not already a dependency. Map uses strict equality (===) for object keys.
        if (!me.dependencies.has(config)) {
            const cleanup = config.subscribe({
                id: me.id,
                fn: me.run.bind(me)
            });

            me.dependencies.set(config, cleanup)
        }
    }
}

const ns = Neo.ns('Neo.core', true);
ns.Effect = Effect;

export default Effect;
