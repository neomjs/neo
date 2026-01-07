import EffectManager  from './EffectManager.mjs';
import {isDescriptor} from './ConfigSymbols.mjs';

/**
 * Represents an observable container for a config property.
 * This class manages the value of a config, its subscribers, and custom behaviors
 * like merge strategies and equality checks defined via a descriptor object.
 *
 * The primary purpose of this class is to enable fine-grained reactivity and
 * decoupled cross-instance state sharing within the Neo.mjs framework.
 * @class Neo.core.Config
 * @private
 * @internal
 */
class Config {
    /**
     * Stores all subscriptions for this Config instance.
     * The data structure is a Map where:
     * - The key is the ID of the subscription owner (e.g., a component's `id`).
     * - The value is another Map (the subscriberMap).
     *
     * The nested subscriberMap is structured as:
     * - The key is the callback function (`fn`).
     * - The value is a Set of scopes (`scopeSet`).
     *
     * This nested structure `Map<string, Map<function, Set<scope>>>` is intentionally chosen
     * to robustly handle the edge case where the same function is subscribed multiple times
     * with different scopes, all under the same owner ID. It ensures that each
     * `fn`-`scope` combination is unique and that cleanup is precise.
     * @member {Object} #subscribers={}
     * @private
     */
    #subscribers = {}
    /**
     * The internal value of the config property.
     * @member {*} #value
     * @private
     */
    #value
    /**
     * The cloning strategy to use when setting a new value.
     * Supported values: 'deep', 'shallow', 'none'.
     * @member {String} clone='deep'
     */

    /**
     * The cloning strategy to use when getting a value.
     * Supported values: 'deep', 'shallow', 'none'.
     * @member {String} cloneOnGet=null
     */

    /**
     * The function used to compare new and old values for equality.
     * Defaults to `Neo.isEqual`. Can be overridden via a descriptor.
     * @member {Function} isEqual=Neo.isEqual
     */

    /**
     * The strategy to use when merging new values into this config.
     * Defaults to 'replace'. Can be overridden via a descriptor merge property.
     * Supported values: 'deep', 'deepArrays', 'replace', 'shallow'.
     * @member {Function|String} mergeStrategy='replace'
     */

    /**
     * Creates an instance of Config.
     * @param {any|Object} configObject - The initial value for the config.
     */
    constructor(configObject) {
        if (Neo.isObject(configObject) && configObject[isDescriptor] === true) {
            this.initDescriptor(configObject)
        } else {
            this.#value = configObject
        }
    }

    /**
     * Gets the current value of the config property.
     * @returns {any} The current value.
     */
    get() {
        // Registers this Config instance as a dependency with the currently active Effect,
        // enabling automatic re-execution when this Config's value changes.
        EffectManager.addDependency(this);
        return this.#value
    }

    /**
     * Initializes the `Config` instance using a descriptor object.
     * Extracts `clone`, `mergeStrategy` and `isEqual` from the descriptor.
     * The internal `#value` is NOT set by this method.
     * @param {Object}    descriptor                      - The descriptor object for the config.
     * @param {string}   [descriptor.clone='deep']        - The clone strategy for set.
     * @param {string}   [descriptor.cloneOnGet]          - The clone strategy for get. Defaults to 'shallow' if clone is 'deep' or 'shallow', and 'none' if clone is 'none'.
     * @param {Function} [descriptor.isEqual=Neo.isEqual] - The equality comparison function.
     * @param {string}   [descriptor.merge='deep']        - The merge strategy.
     * @param {any}       descriptor.value                - The default value for the config (not set by this method).
     */
    initDescriptor({clone, cloneOnGet, isEqual, merge}) {
        let me = this;

        if (clone && clone !== me.clone) {
            Object.defineProperty(me, 'clone', {
                configurable: true, enumerable: true, value: clone, writable: true
            })
        }

        if (cloneOnGet && cloneOnGet !== me.cloneOnGet) {
            Object.defineProperty(me, 'cloneOnGet', {
                configurable: true, enumerable: true, value: cloneOnGet, writable: true
            })
        }

        if (isEqual && isEqual !== me.isEqual) {
            Object.defineProperty(me, 'isEqual', {
                configurable: true, enumerable: true, value: isEqual, writable: true
            })
        }

        if (merge && merge !== me.mergeStrategy) {
            Object.defineProperty(me, 'mergeStrategy', {
                configurable: true, enumerable: true, value: merge, writable: true
            })
        }
    }

    /**
     * Notifies all subscribed callbacks about a change in the config's value.
     * It iterates through the nested subscriber structure to ensure each callback
     * is executed with its intended scope.
     * @param {any} newValue - The new value of the config.
     * @param {any} oldValue - The old value of the config.
     */
    notify(newValue, oldValue) {
        for (const id in this.#subscribers) {
            if (this.#subscribers.hasOwnProperty(id)) {
                const subscriberMap = this.#subscribers[id];
                for (const [fn, scopeSet] of subscriberMap) {
                    for (const scope of scopeSet) {
                        fn.call(scope || null, newValue, oldValue)
                    }
                }
            }
        }
    }

    /**
     * Sets a new value for the config property.
     * This method performs an equality check using `this.isEqual` before updating the value.
     * If the value has changed, it updates `#value` and notifies all subscribers.
     * @param {any} newValue - The new value to set.
     * @returns {Boolean} True if the value changed, false otherwise.
     */
    set(newValue) {
        if (newValue === undefined) return false; // Preserve original behavior for undefined

        const
            me       = this,
            oldValue = me.#value;

        // The setter automatically uses the configured equality check
        if (!me.isEqual(newValue, oldValue)) {
            me.#value = newValue;
            me.notify(newValue, oldValue);
            return true
        }

        return false
    }

    /**
     * Sets the internal value of the config property directly, without performing
     * an equality check or notifying subscribers.
     * This method is intended for internal framework use where direct assignment
     * is necessary (e.g., during initial setup or specific internal optimizations).
     * @param {any} newValue - The new value to set directly.
     */
    setRaw(newValue) {
        this.#value = newValue
    }

    /**
     * Subscribes a callback function to changes in this config's value.
     * The callback will be invoked with `(newValue, oldValue)` whenever the config changes.
     * @param {Object}   options        - An object containing the subscription details.
     * @param {String}   options.id     - The ID of the subscription owner (e.g., a Neo.core.Base instance's id).
     * @param {Function} options.fn     - The callback function.
     * @param {Object}  [options.scope] - The scope to execute the callback in.
     * @returns {Function} A cleanup function to unsubscribe the callback.
     */
    subscribe({id, fn, scope}) {
        if (typeof id !== 'string' || id.length === 0 || typeof fn !== 'function') {
            throw new Error([
                'Config.subscribe: options must be an object with a non-empty string `id` ',
                '(the subscription owner\'s id), and a callback function `fn`.'
            ].join(''))
        }

        const me = this;

        // Get or create the top-level Map for the subscription owner.
        if (!me.#subscribers[id]) {
            me.#subscribers[id] = new Map()
        }

        const subscriberMap = me.#subscribers[id];

        // Get or create the Set of scopes for the specific callback function.
        if (!subscriberMap.has(fn)) {
            subscriberMap.set(fn, new Set())
        }

        const scopeSet = subscriberMap.get(fn);
        scopeSet.add(scope);

        // The returned cleanup function is precise. It removes only the specific
        // scope for the function, and cleans up the parent data structures
        // (the Set and the Maps) only if they become empty.
        return () => {
            const currentSubscriberMap = me.#subscribers[id];
            if (currentSubscriberMap) {
                const currentScopeSet = currentSubscriberMap.get(fn);
                if (currentScopeSet) {
                    currentScopeSet.delete(scope);
                    if (currentScopeSet.size === 0) {
                        currentSubscriberMap.delete(fn);
                        if (currentSubscriberMap.size === 0) {
                            delete me.#subscribers[id]
                        }
                    }
                }
            }
        }
    }
}

Object.defineProperties(Config.prototype, {
    clone        : {configurable: true, enumerable: false, value: 'deep',      writable: false},
    cloneOnGet   : {configurable: true, enumerable: false, value: null,        writable: false},
    isEqual      : {configurable: true, enumerable: false, value: Neo.isEqual, writable: false},
    mergeStrategy: {configurable: true, enumerable: false, value: 'replace',   writable: false}
});

export default Neo.gatekeep(Config, 'Neo.core.Config');
