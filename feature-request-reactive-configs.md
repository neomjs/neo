# Feature Request: Reactive Configs with Optional Descriptors

## Summary

The current reactivity model in Neo.mjs is excellent for handling config changes within a single class instance. However, it lacks a straightforward mechanism for cross-instance reactivity. This proposal outlines a new, fully opt-in reactivity and metadata system to enable seamless, decoupled, cross-instance state sharing, targeting a future v11 release.

This system is based on a new `Config` class that can be initialized with either a simple value (for backward compatibility) or a descriptor object for advanced control over behavior like merging and equality checks.

## Proposed Solution: The `Config` Class & Descriptors

The core of this proposal is a new `Config` class that acts as an observable container for a config property. It can be configured using an optional, symbol-marked descriptor object.

### 1. The `isDescriptor` Symbol

To unambiguously distinguish a descriptor object from a regular object-based value, a well-known symbol will be used.

```javascript
// e.g., in a new file src/core/ConfigSymbols.mjs
export const isDescriptor = Symbol.for('Neo.Config.isDescriptor');
```

### 2. Defining Configs: Two Approaches

This system is fully opt-in. Developers can continue to define configs as simple values. For more control, they can use a descriptor object.

```javascript
import {isDescriptor} from '../core/ConfigSymbols.mjs';

class MyComponent extends Base {
    static config = {
        // Option 1: Simple value (no change to existing code)
        title_: 'Default Title',

        // Option 2: Descriptor object (new, optional feature)
        items_: {
            [isDescriptor]: true, // The flag that marks this as a descriptor
            value: [],
            merge: 'replace', // 'deep', 'shallow', 'replace', or a custom function
            isEqual: (a, b) => a.length === b.length // A custom, performant equality check
        }
    }
}
```

### 3. The `Config` Class Implementation

The `Config` class constructor will check for the `isDescriptor` symbol to determine how to initialize itself.

```javascript
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

```

### 4. Framework Integration & Controller Access

### 5. Preserving Transactional Updates: The `configSymbol`

A critical requirement is to preserve the existing transactional nature of config updates. When a developer calls `this.set({a: 1, b: 2})`, any `afterSet` hook triggered for `a` must be able to see the new, pending value of `b`, even though `b`'s own setter has not run yet.

This is handled by a private `[configSymbol]` object on the instance, which acts as a temporary staging area for all pending changes within a single `set()` operation. The `core.Base` class's `processConfigs()` method iteratively processes these pending changes. When `processConfigs()` assigns a value from `[configSymbol]` to an instance property (e.g., `this.myConfig = this[configSymbol].myConfig`), it triggers the corresponding config's setter.

The implementation of the new reactive configs **must** integrate with this system. The auto-generated getters and setters for reactive config properties (`myConfig_`) will be modified to ensure transactional consistency.

The *public* getter (`this.myConfig`) will first check `this[configSymbol]` for any pending values. If a pending value exists, it will be used, ensuring that `afterSet` hooks and other code within the same transactional `set()` operation see the most up-to-date, albeit not-yet-fully-applied, value. The *private* getter (`this._myConfig`) will directly retrieve the value from the `Config` controller instance.

This hybrid approach ensures that the new subscription-based reactivity can coexist with the framework's established, robust system for handling batched and interdependent config updates.

### 5. Adjusting `Neo.mjs#autoGenerateGetSet`

The final step is to adjust the function that generates the getters and setters on the class prototype. It will now delegate all operations to the `Config` controller instance obtained via `this.getConfig()`.

```javascript
// src/Neo.mjs -> autoGenerateGetSet()
function autoGenerateGetSet(proto, key) {
    const
        _key      = '_' + key,
        uKey      = key[0].toUpperCase() + key.slice(1),
        beforeGet = 'beforeGet' + uKey,
        beforeSet = 'beforeSet' + uKey,
        afterSet  = 'afterSet'  + uKey;

    // ... (other parts of autoGenerateGetSet)

    Object.defineProperty(proto, key, { // Public getter/setter (e.g., this.myConfig)
        get() {
            let me        = this,
                hasNewKey = Object.hasOwn(me[configSymbol], key),
                newKey    = me[configSymbol][key],
                value     = hasNewKey ? newKey : me[_key]; // Accesses the private property for the committed value

            if (Array.isArray(value)) {
                if (key !== 'items') { // Special handling for items, if applicable
                    value = [...value]
                }
            } else if (value instanceof Date) {
                value = new Date(value.valueOf())
            }

            if (hasNewKey) {
                // This assignment triggers the public setter, which then interacts with the Config instance.
                // This ensures the value from configSymbol is processed through the full setter logic.
                me[key] = value;
                value = me[_key]; // Return the value parsed by the setter (now committed to Config instance)
                delete me[configSymbol][key]; // Remove from staging area
            }

            if (typeof me[beforeGet] === 'function') {
                value = me[beforeGet](value)
            }

            return value
        },
        set(value) {
            const config = this.getConfig(key);
            if (!config) return;

            const oldValue = config.get();

            // 1. Run internal `beforeSet` hook for validation/modification.
            if (typeof this[beforeSet] === 'function') {
                value = this[beforeSet](value, oldValue);
                if (value === undefined) return; // Abort change
            }

            // 2. Update the Config controller's value.
            //    This triggers all external subscribers AND returns true if value changed.
            if (config.set(value)) { // <--- CHANGE HERE: Use return value of config.set()
                // 3. Run internal `afterSet` hooks for internal side-effects.
                //    The equality check is now handled by the config controller itself.
                const newValue = config.get(); // Get potentially modified value
                this[afterSet]?.(newValue, oldValue);
                this.afterSetConfig?.(key, newValue, oldValue);
            }
        }
    });

    Object.defineProperty(proto, _key, { // Private getter/setter (e.g., this._myConfig)
        get() {
            // Directly retrieves the committed value from the Config controller.
            return this.getConfig(key)?.get();
        },
        set(value) {
            // Directly sets the raw value in the Config controller, bypassing equality checks and notifications.
            this.getConfig(key)?.setRaw(value);
        }
    });
}
```


The framework core (`core.Base`, `Neo.mjs`) will be updated to use this new `Config` class. `core.Base` will be responsible for creating, storing, and providing access to the `Config` controller instances.

```javascript
// src/core/Base.mjs
class Base {
    // 1. A private field to store the Config controller instances.
    #configs = {};

    construct(config={}) {
        // ... (other initialization logic)
        // Config instances are now created lazily within getConfig() for reactive configs.
    }

    /**
     * 2. A public method to access the underlying Config controller.
     * This enables advanced interactions like subscriptions.
     * @param {String} key The name of the config property (e.g., 'items').
     * @returns {Config|undefined} The Config instance, or undefined if not found.
     */
    getConfig(key) {
        let me = this;

        // Create a Config instance only if it doesn't exist and the key is a reactive config.
        if (!me.#configs[key] && me.isConfig(key)) {
            me.#configs[key] = new Config();
        }

        return me.#configs[key];
    }


    /**
     * @param {String} key
     * @returns {Boolean}
     */
    isConfig(key) {
        return Object.hasOwn(this.constructor.config, key) && Neo.hasPropertySetter(this, key)
    }
}
```

The generated setters in `Neo.mjs` will then interact with the `Config` instance returned by `this.getConfig(key)`, which will in turn respect the defined `mergeStrategy` and `isEqual` functions.

## Example: The Developer Experience

The primary benefit is seamless cross-instance reactivity.

```javascript
// In ComponentA
const componentB = Neo.get('b');

// Declaratively subscribe to the config.
// The method to get the Config instance could be named `getConfig()` or `getConfigController()`
this.cleanup = componentB.getConfig('items').subscribe((newValue, oldValue) => {
    this.someOtherProperty = newValue; // Directly and reactively update
});

// In ComponentA's destroy() method:
this.cleanup?.(); // Simple, clean, and prevents memory leaks.
```

## Key Benefits

1.  **Opt-in Complexity & Non-Breaking:** The entire system is optional. Existing code will work without modification. Developers only engage with descriptors when needed.
2.  **Fine-Grained Control:** Declaratively control config behavior like merging and equality checking for performance and correctness.
3.  **Decoupled Cross-Instance Reactivity:** The `subscribe()` API enables a powerful, modern state management paradigm.
4.  **Vastly Improved Developer Experience:** Simplifies the implementation of complex, interactive applications.

## Implementation Notes

Based on a review of the `reactive-config` feature branch, the following key implementation details were observed and should be considered part of the final design:

1.  **Order of Operations in `construct()` is Critical:** The `construct()` method processes the incoming `config` object in a specific, deliberate order:
    *   **Non-Config Fields First:** It first calls `setFields()` to identify and assign any properties that are *not* defined in the `static config` hierarchy. These are applied directly to the instance. This is crucial to prevent race conditions, ensuring that any `afterSet` hooks for reactive configs have access to the most up-to-date values of these other fields when they are all passed in a single `set()` call.
    *   **Config Processing:** Only after non-config fields are handled does the system proceed to process reactive and non-reactive configs.

2.  **Reactivity is Inherited:** A config property is considered "reactive" (and thus gets a `Neo.core.Config` wrapper) if it has a generated setter. This is triggered by defining the config with a trailing underscore (e.g., `myValue_`) in the `static config` block of **any class in its inheritance chain**. A subclass can override the default value of an inherited reactive config without using the underscore, and it will correctly remain reactive.

3.  **Non-Reactive Configs vs. Public Fields:** There is a critical distinction between non-reactive configs and standard public class fields:
    *   **Non-Reactive Configs:** Their default values are applied to the class **prototype**. This makes them highly flexible, as the defaults are shared and can be modified at runtime before an instance is created. When a value is passed to an instance, it creates an instance-level property that shadows the prototype's value.
    *   **Public Class Fields:** These are assigned directly to the instance inside its constructor, so their default values cannot be easily modified at runtime for all subsequent instances.

4.  **The `id` and `parentId` Assignment Issue:**
    The `dev` branch correctly assigns component `id`s early in the `construct()` lifecycle. In contrast, the `reactive-config` branch processes `id` and `parentId` as reactive configs, meaning their values are fully resolved later, within the `initConfig()` and `processConfigs()` flow. This change in timing leads to a critical issue where child components, when their `StateProvider` attempts to access `this.component.parentId` (e.g., in `StateProvider.getParent()`), still report `'document.body'` instead of their actual parent's ID. This is because the `afterSetParentId` hook, which would update `parentId`, has not yet executed. While simple examples like `examples/button/Base` render without errors, larger applications like `apps/portal` exhibit `"No state.Provider found with the specified data property"` errors, which are a direct consequence of `StateProvider`s attempting to resolve bindings using an incorrect component hierarchy due to the delayed `id` and `parentId` assignment.

## Proposed Target

This is a significant but cohesive architectural enhancement. Thanks to the symbol-based opt-in mechanism, it can be implemented in a **single phase** and targeted for the next major version, **v11.0.0**.
