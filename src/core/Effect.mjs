import Config        from './Config.mjs';
import EffectManager from './EffectManager.mjs';
import IdGenerator   from './IdGenerator.mjs';

/**
 * Creates a reactive effect that automatically tracks its dependencies and re-runs when any of them change.
 * This is a lightweight, plain JavaScript class for performance.
 * It serves as a core reactive primitive, enabling automatic and dynamic dependency tracking.
 * @class Neo.core.Effect
 */
class Effect {
    /**
     * The optional component id this effect belongs to.
     * @member {String|null} componentId=null
     */
    componentId = null
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
     * @member {Neo.core.Config}
     * @protected
     */
    isRunning = null

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
     * @param {Function|Object}  fn              - The function to execute, or a config object for the effect.
     * @param {Function}        [fn.fn]          - The function to execute for the effect (if the first argument is an object).
     * @param {String}          [fn.componentId] - The component id this effect belongs to.
     * @param {Boolean}         [fn.lazy=false]  - If true, the effect will not run immediately upon creation.
     * @param {Object|Object[]} [fn.subscriber]  - A single subscriber or an array of subscribers for the isRunning config.
     * @param {Object}          [options={}]     - Optional. Used if the first argument is a function, this object contains the options.
     * @example
     * // Signature 1: Function and Options
     * const myEffect = new Effect(() => console.log('Run'), {lazy: true});
     * @example
     * // Signature 2: Single Config Object
     * const myEffect = new Effect({fn: () => console.log('Run'), lazy: true});
     */
    constructor(fn, options={}) {
        const me = this;

        const {
              fn: effectFn,
              componentId,
              lazy = false,
              subscriber
        } = (typeof fn === 'function') ? { ...options, fn } : (fn || {});

        if (componentId) {
            me.componentId = componentId
        }

        me.isRunning = new Config(false);

        if (subscriber) {
            [].concat(subscriber).forEach(sub => me.isRunning.subscribe(sub))
        }

        if (lazy) {
            me._fn = effectFn
        } else {
            me.fn = effectFn
        }
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
     * Executes the effect function, re-evaluating its dependencies.
     * If the EffectManager is paused (e.g., inside a batch), it queues itself to be run later.
     * @protected
     */
    run() {
        const me = this;

        if (me.isDestroyed) {
            return
        }

        // Check if already running without creating a dependency on `isRunning`.
        EffectManager.pauseTracking();
        const isRunning = me.isRunning.get();
        EffectManager.resumeTracking();

        if (isRunning) {
            return
        }

        // If the manager is globally paused for batching, queue this effect and stop.
        if (EffectManager.isPaused()) {
            EffectManager.queue(me);
            return
        }

        // Set `isRunning` to true without creating a dependency.
        EffectManager.pauseTracking();
        me.isRunning.set(true);
        EffectManager.resumeTracking();

        // Clear old dependencies and set this as the active effect.
        me.dependencies.forEach(cleanup => cleanup());
        me.dependencies.clear();
        EffectManager.push(me);

        try {
            // Execute the function, which will collect new dependencies.
            me.fn()
        } finally {
            // Clean up after the run.
            EffectManager.pop();

            // Set `isRunning` to false without creating a dependency.
            EffectManager.pauseTracking();
            me.isRunning.set(false);
            EffectManager.resumeTracking()
        }
    }

    /**
     * Adds a `Neo.core.Config` instance as a dependency for this effect.
     * @param {Neo.core.Config} config The config instance to subscribe to.
     * @protected
     */
    addDependency(config) {
        const me = this;

        if (!me.dependencies.has(config)) {
            const cleanup = config.subscribe({
                id: me.id,
                fn: me.run.bind(me)
            });

            me.dependencies.set(config, cleanup)
        }
    }
}

export default Neo.gatekeep(Effect, 'Neo.core.Effect', () => {
    /**
     * Factory shortcut to create a new Neo.core.Effect instance.
     * @function Neo.effect
     * @param {Function|Object} fn - The function to execute, or a config object for the effect.
     * @param {Object} [options] - Optional. Used if the first argument is a function.
     * @returns {Neo.core.Effect}
     */
    Neo.effect = (fn, options) => new Effect(fn, options)
});
