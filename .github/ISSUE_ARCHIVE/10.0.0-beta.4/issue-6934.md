---
id: 6934
title: Reactive Configs with Optional Descriptors
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-02T15:34:58Z'
updatedAt: '2025-07-04T12:12:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6934'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-04T12:12:50Z'
---
# Reactive Configs with Optional Descriptors

**Reported by:** @tobiu on 2025-07-02

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

class Config {
    #value;
    #subscribers = new Set();

    // Meta-properties with framework defaults
    mergeStrategy = 'deep';
    isEqual = Neo.isEqual;

    constructor(configObject) {
        // The symbol check makes the logic clean and unambiguous
        if (Neo.isObject(configObject) && configObject[isDescriptor] === true) {
            this.initDescriptor(configObject);
        } else {
            // It's a simple value, not a descriptor
            this.#value = configObject;
        }
    }

    initDescriptor(descriptor) {
        this.#value = descriptor.value;
        this.mergeStrategy = descriptor.merge || this.mergeStrategy;
        this.isEqual = descriptor.isEqual || this.isEqual;
    }

    get() { return this.#value; }

    set(newValue) {
        const oldValue = this.#value;
        // The setter automatically uses the configured equality check
        if (!this.isEqual(newValue, oldValue)) {
            this.#value = newValue;
            this.notify(newValue, oldValue);
        }
    }

    subscribe(callback) {
        this.#subscribers.add(callback);
        return () => this.#subscribers.delete(callback);
    }

    notify(newValue, oldValue) {
        for (const callback of this.#subscribers) {
            callback(newValue, oldValue);
        }
    }
}
```

### 4. Framework Integration & Controller Access

### 5. Adjusting `Neo.mjs#autoGenerateGetSet`

The final step is to adjust the function that generates the getters and setters on the class prototype. It will now delegate all operations to the `Config` controller instance obtained via `this.getConfig()`.

```javascript
// src/Neo.mjs -> autoGenerateGetSet()
function autoGenerateGetSet(proto, key) {
    // ...

    Object.defineProperty(proto, key, {
        get() {
            // The getter now retrieves the value from the Config controller.
            return this.getConfig(key)?.get();
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
            //    This triggers all external subscribers.
            config.set(value);

            // 3. Run internal `afterSet` hooks for internal side-effects.
            //    The equality check is now handled by the config controller itself.
            const newValue = config.get(); // Get potentially modified value
            if (config.isEqual(newValue, oldValue) === false) {
                this[afterSet]?.(newValue, oldValue);
                this.afterSetConfig?.(key, newValue, oldValue);
            }
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
        // ...
        // 2. During initialization, create and store a Config instance for each property.
        const mergedConfigs = this.mergeConfig(config);
        for (const key in mergedConfigs) {
            this.#configs[key] = new Config(mergedConfigs[key]);
        }
        // ...
    }

    /**
     * 3. A public method to access the underlying Config controller.
     * This enables advanced interactions like subscriptions.
     * @param {String} key The name of the config property (e.g., 'items').
     * @returns {Config|undefined} The Config instance, or undefined if not found.
     */
    getConfig(key) {
        return this.#configs[key];
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

## Proposed Target

This is a significant but cohesive architectural enhancement. Thanks to the symbol-based opt-in mechanism, it can be implemented in a **single phase** and targeted for the next major version, **v11.0.0**.

## Comments

### @tobiu - 2025-07-04 12:12

it is working stable now, closing the ticket, but there will be follow-ups.

