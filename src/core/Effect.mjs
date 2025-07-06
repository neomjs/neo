import EffectManager from './EffectManager.mjs';
import IdGenerator   from './IdGenerator.mjs';

/**
 * Creates a reactive effect that automatically tracks its dependencies and re-runs when any of them change.
 * This is a lightweight, plain JavaScript class for performance.
 * @class Neo.core.Effect
 */
class Effect {
    /**
     * A Set containing the cleanup functions for all current subscriptions.
     * @member {Set|null}
     * @protected
     */
    dependencies = null
    /**
     * The function to execute.
     * @member {Function|null}
     */
    fn = null
    /**
     * The unique identifier for this effect instance.
     * @member {String|null}
     */
    id = null
    /**
     * @member {Boolean}
     * @protected
     */
    isDestroyed = false

    /**
     * @param {Object} config
     * @param {Function} config.fn The function to execute for the effect.
     */
    constructor({fn}) {
        Object.assign(this, {
            dependencies: new Set(),
            fn,
            id          : IdGenerator.getId('neo-effect')
        });

        this.run()
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
     * @protected
     */
    run() {
        const me = this;

        if (me.isDestroyed) return;

        // Clean up old dependencies before re-running to avoid stale subscriptions.
        me.dependencies.forEach(cleanup => cleanup());
        me.dependencies.clear();

        EffectManager.push(me);

        try {
            me.fn()
        } finally {
            EffectManager.pop()
        }
    }

    /**
     * Adds a `Neo.core.Config` instance as a dependency for this effect.
     * @param {Neo.core.Config} config The config instance to subscribe to.
     * @protected
     */
    addDependency(config) {
        const
            me      = this,
            cleanup = config.subscribe({
            id: me.id,
            fn: me.run.bind(me)
        });

        me.dependencies.add(cleanup);
    }
}

const ns = Neo.ns('Neo.core', true);
ns.Effect = Effect;

export default Effect;
