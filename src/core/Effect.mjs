import Config             from './Config.mjs';
import EffectManager      from './EffectManager.mjs';
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

        // This single statement handles both (fn, options) and ({...}) signatures
        // by normalizing them into a single object that we can destructure.
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

        // The subscriber(s) must be added *before* the first run is triggered.
        // This is critical for consumers like functional components, which need to process
        // the initial VDOM synchronously within the constructor lifecycle.
        if (subscriber) {
            // A concise way to handle both single and array subscribers.
            [].concat(subscriber).forEach(sub => me.isRunning.subscribe(sub))
        }

        // If lazy, just store the function without running it.
        // Otherwise, use the setter to trigger the initial run.
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
     * Executes the effect function, tracking its dependencies.
     * This is called automatically on creation and whenever a dependency changes.
     * The dynamic re-tracking ensures the effect always reflects its current dependencies,
     * even if the logic within `fn` changes conditionally.
     * @protected
     */
    run() {
        const me = this;

        EffectManager.pause(); // Pause dependency tracking for isRunning.get()
        if (me.isDestroyed || me.isRunning.get()) {
            EffectManager.resume(); // Resume if we return early
            return
        }

        if (EffectBatchManager.isBatchActive()) {
            EffectBatchManager.queueEffect(me);
            return
        }

        me.isRunning.set(true);

        me.dependencies.forEach(cleanup => cleanup());
        me.dependencies.clear();

        EffectManager.push(me);
        EffectManager.resume();

        try {
            me.fn()
        } finally {
            EffectManager.pop();
            EffectManager.pause(); // Pause dependency tracking for isRunning.set(false)
            me.isRunning.set(false);
            EffectManager.resume() // Resume after isRunning.set(false)
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

Neo.core ??= {};

if (!Neo.core.Effect) {
    Neo.core.Effect = Effect;

    /**
     * Factory shortcut to create a new Neo.core.Effect instance.
     * @function Neo.effect
     * @param {Function|Object} fn - The function to execute, or a config object for the effect.
     * @param {Object} [options] - Optional. Used if the first argument is a function.
     * @returns {Neo.core.Effect}
     */
    Neo.effect = (fn, options) => new Effect(fn, options)
}

export default Neo.core.Effect;
