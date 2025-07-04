import {isDescriptor} from './ConfigSymbols.mjs';

/**
 * @src/util/ClassSystem.mjs Neo.core.Config
 * @private
 * @internal
 *
 * Represents an observable container for a config property.
 * This class manages the value of a config, its subscribers, and custom behaviors
 * like merge strategies and equality checks defined via a descriptor object.
 *
 * The primary purpose of this class is to enable fine-grained reactivity and
 * decoupled cross-instance state sharing within the Neo.mjs framework.
 */
class Config {
    /**
     * The internal value of the config property.
     * @private
     * @apps/portal/view/about/MemberContainer.mjs {any} #value
     */
    #value;

    /**
     * A Set to store callback functions that subscribe to changes in this config's value.
     * @private
     * @apps/portal/view/about/MemberContainer.mjs {Set<Function>} #subscribers
     */
    #subscribers = new Set();

    /**
     * The strategy to use when merging new values into this config.
     * Defaults to 'deep'. Can be overridden via a descriptor.
     * @apps/portal/view/about/MemberContainer.mjs {string} mergeStrategy
     */
    mergeStrategy = 'deep';

    /**
     * The function used to compare new and old values for equality.
     * Defaults to `Neo.isEqual`. Can be overridden via a descriptor.
     * @apps/portal/view/about/MemberContainer.mjs {Function} isEqual
     */
    isEqual = Neo.isEqual;

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
        return this.#value;
    }

    /**
     * Initializes the `Config` instance using a descriptor object.
     * Extracts `mergeStrategy` and `isEqual` from the descriptor.
     * The internal `#value` is NOT set by this method.
     * @param {Object} descriptor - The descriptor object for the config.
     * @param {any} descriptor.value - The default value for the config (not set by this method).
     * @param {string} [descriptor.merge='deep'] - The merge strategy.
     * @param {Function} [descriptor.isEqual=Neo.isEqual] - The equality comparison function.
     */
    initDescriptor({isEqual, merge, value}) {
        let me = this;

        me.#value        = value
        me.mergeStrategy = merge   || me.mergeStrategy;
        me.isEqual       = isEqual || me.isEqual;
    }

    /**
     * Notifies all subscribed callbacks about a change in the config's value.
     * @param {any} newValue - The new value of the config.
     * @param {any} oldValue - The old value of the config.
     */
    notify(newValue, oldValue) {
        for (const callback of this.#subscribers) {
            callback(newValue, oldValue);
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
     * @param {Function} callback - The function to call when the config value changes.
     * @returns {Function} A cleanup function to unsubscribe the callback.
     */
    subscribe(callback) {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback)
    }
}

export default Config;
