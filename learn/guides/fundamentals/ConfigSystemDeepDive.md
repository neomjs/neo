# Config System Deep Dive

**Pre-requisite:** It is highly recommended to study [The Unified Class Config System](#/learn/benefits.ConfigSystem)
first to understand the foundational concepts and benefits.

The Neo.mjs class configuration system is a cornerstone of the framework, providing a powerful, declarative, and
reactive way to manage the state of your components and classes. Its internal mechanics are deeply intertwined with
the instance lifecycle, ensuring predictable and consistent behavior. This guide will take you on a deep dive into
how it achieves its remarkable consistency and power.

## 1. Core Concepts Recap

At its heart, the config system is built on a few key principles:

*   **`static config` Block:** All configurable properties of a class are declared in a `static config = {}` block.
    This provides a single, clear source of truth for a class's API.
*   **`_` Suffix Convention:** Config properties that require custom logic when they change are declared with a trailing
    underscore (e.g., `myValue_`). This signals the framework to automatically create a native getter and setter on the
    class's prototype for this property.
*   **Lifecycle Hooks:** For a config like `myValue_`, the framework provides optional lifecycle hooks that you can
    implement in your class:
    *   `beforeGetMyValue(value)`: Called before the getter returns the value.
    *   `beforeSetMyValue(value, oldValue)`: Called before the setter applies the new value.
    *   `afterSetMyValue(value, oldValue)`: Called after the setter has applied the new value.
*   **Reactivity:** The `afterSet` hooks are the heart of the reactive system. They allow you to define logic that
    automatically runs whenever a specific config property changes, ensuring your UI and application state are always
    in sync.

## 2. The Internal Mechanics: `set()`, `processConfigs()`, and `configSymbol`

To truly understand how Neo.mjs handles complex scenarios like simultaneous updates and inter-dependencies, we must
look at the internal machinery: the `set()` and `processConfigs()` methods in `Neo.core.Base`, and the special
`configSymbol` object.

### The `set()` Method: Your Gateway to Updates

The `set()` method is the public interface for changing one or more config properties at once. When you call
`this.set({a: 1, b: 2})`, you kick off a carefully orchestrated sequence.

[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)]
```javascript readonly
// Simplified for clarity
set(values={}) {
    let me = this;

    // If there are pending configs from a previous operation, process them first.
    if (Object.keys(me[configSymbol]).length > 0) {
        me.processConfigs();
    }

    // Stage the new values in the configSymbol object.
    Object.assign(me[configSymbol], values); // (A)

    // Start processing the newly staged values.
    me.processConfigs(true); // (B)
}
```

Here’s the breakdown:
1.  **Pre-processing (within `construct()`):** The method first checks if the internal `configSymbol` object has any
    leftover configs from a previous, unfinished operation (e.g., from a parent class's `construct()` call). If so,
    it processes them to ensure a clean state before new values are staged.
2.  **Staging (A):** `Object.assign(me[configSymbol], values)` is the critical first step. All new values from your
    `set()` call are merged into the `configSymbol` object. This object acts as a **temporary staging area**. It
    creates a snapshot of the intended end-state for all properties in this specific `set()` operation *before*
    any individual setters or `afterSet` hooks are invoked.
3.  **Processing (B):** `me.processConfigs(true)` is called. This kicks off the process of applying the staged values
    from `configSymbol` to the actual instance properties. The `true` argument (`forceAssign`) is crucial, as we'll
    see next.

### The `processConfigs()` Method: The Heart of the Operation

This internal method iteratively processes the configs stored in `configSymbol`. It's designed as a recursive
function to handle the dynamic nature of config processing, where one `afterSet` might trigger another `set()`.

[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)]
```javascript readonly
// Simplified for clarity
processConfigs(forceAssign=false) {
    let me   = this,
        keys = Object.keys(me[configSymbol]); // Get keys of pending configs

    if (keys.length > 0) {
        let key = keys[0];
        let value = me[configSymbol][key];

        // The auto-generated setter for the config is triggered here.
        me[key] = value; // (C)

        // The config is removed from the staging area after its setter is called.
        delete me[configSymbol][key]; // (D)

        // Recursively call to process the next config.
        me.processConfigs(forceAssign); // (E)
    }
}
```

*   **Iteration:** `processConfigs` takes the *first* key from `configSymbol`. It avoids a standard loop to prevent
    issues if an `afterSet` hook modifies `configSymbol`.
*   **Assignment (C):** `me[key] = value` is the most important step. This does **not** directly change a backing
    field. Instead, it triggers the actual auto-generated **setter** for the config property (e.g., `set a(value)`).
    This native setter is responsible for:
    1.  Running the `beforeSet` hook (if it exists).
    2.  Updating the internal backing property (e.g., `this._a = value`).
    3.  Running the `afterSet` hook (if it exists and the value has changed).
*   **Deletion (D):** `delete me[configSymbol][key]` removes the property from the staging area *after* its setter
    has been invoked. This is vital to prevent reprocessing and to mark the config as handled.
*   **Recursion (E):** The method calls itself to process the next item in `configSymbol` until it's empty.

## 3. Solving the "Circular Reference" Problem

What happens when two `afterSet` methods depend on each other's properties?

Consider this common scenario:
```javascript readonly
class MyComponent extends Component {
    static config = {
        a_: 1,
        b_: 2
    }

    afterSetA(value, oldValue) {
        // This depends on 'b'
        console.log(`a changed to ${value}, b is ${this.b}`);
    }

    afterSetB(value, oldValue) {
        // This depends on 'a'
        console.log(`b changed to ${value}, a is ${this.a}`);
    }

    onConstructed() {
        super.onConstructed();
        this.set({
            a: 10,
            b: 20
        });
    }
}
```
When `this.set({a: 10, b: 20})` is called, which `afterSet` runs first? And when it runs, what value will it see
for the *other* property?

**This is where the brilliance of the `configSymbol` shines.**

Here's the sequence:
1.  **`set()` called:** `this.set({a: 10, b: 20})` is executed.
2.  **Staging:** The `configSymbol` is immediately populated: `me[configSymbol] = {a: 10, b: 20}`. The internal
    backing properties `_a` and `_b` have **not** been updated yet.
3.  **`processConfigs()` starts:**
    *   It picks `a`. The setter `setA(10)` is called.
    *   Inside `setA`, the internal `this._a` is updated to `10`.
    *   `afterSetA(10, 1)` is triggered.
4.  **Inside `afterSetA`:**
    *   The code encounters `this.b`. This calls the auto-generated getter for `b`.
    *   **Crucially, the getter for `b` is smart.** It first checks if `b` exists as a key in the `configSymbol`
        staging area.
    *   It finds `b: 20` in `configSymbol` and immediately returns `20`, the **new, pending value**. It does *not*
        return the old value from `this._b`.
    *   The console logs: `a changed to 10, b is 20`.
5.  **`processConfigs()` continues:**
    *   `a` is removed from `configSymbol`.
    *   The recursion continues, and it now picks `b`. The setter `setB(20)` is called.
    *   Inside `setB`, `this._b` is updated to `20`.
    *   `afterSetB(20, 2)` is triggered.
6.  **Inside `afterSetB`:**
    *   The code encounters `this.a`. The getter for `a` is called.
    *   It checks `configSymbol`, but `a` is no longer there (it was processed).
    *   It therefore returns the value from the internal backing property, `this._a`, which is now `10`.
    *   The console logs: `b changed to 20, a is 10`.

**Conclusion:** The `configSymbol` acts as a consistent, authoritative snapshot for the duration of a `set()`
operation. This guarantees that all `afterSet` handlers, regardless of their execution order, operate on the most
current and consistent state of all config properties involved in that operation.

## 4. In-depth Example: A Reactive `MainContainer`

Let's analyze a practical example to see these concepts in action. The `Neo.examples.core.config.MainContainer`
demonstrates how to build a reactive UI declaratively.

**The Goal:** Create a container with two labels. The text of each label is calculated based on the values of two
config properties, `a` and `b`. A button allows the user to change `a` and `b` simultaneously.

**The Declarative Approach (`static config`)**

The entire UI structure, including child components and event handlers, is defined within the `static config` block.
This is the recommended approach as it makes the component's structure immediately clear.

```javascript readonly
// From: Neo.examples.core.config.MainContainer
import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.core.config.MainContainer',
        a_: null,
        b_: null,
        style    : { padding: '20px' },
        items: [{
            module: Panel,
            // ... panel configs
            headers: [{
                dock : 'top',
                items: [
                    { ntype: 'label', flag: 'label1' },
                    { ntype: 'label', flag: 'label2' },
                    { ntype: 'component', flex: 1 },
                    {
                        handler: 'up.changeConfig', // Declarative handler
                        iconCls: 'fa fa-user',
                        text   : 'Change configs'
                    }
                ]
            }],
            items: [{ ntype: 'label', text: 'Click the change configs button!' }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.set({ a: 5, b: 5 });
    }

    afterSetA(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label1'}).text = value + this.b;
        }
    }

    afterSetB(value, oldValue) {
        if (oldValue !== undefined) {
            this.down({flag: 'label2'}).text = value + this.a;
        }
    }

    changeConfig(data) {
        this.set({ a: 10, b: 10 });
    }
}
```

### Tracing the Data Flow

1.  **Initialization (`onConstructed`)**:
    *   `this.set({a: 5, b: 5})` is called. This happens within the `onConstructed()` lifecycle hook, which is guaranteed
        to run *after* the instance's `construct()` method has fully processed its initial configuration.
    *   `configSymbol` becomes `{a: 5, b: 5}`.
    *   `afterSetA` runs. It calculates `label1.text` as `value (5) + this.b (reads 5 from configSymbol) = 10`.
    *   `afterSetB` runs. It calculates `label2.text` as `value (5) + this.a (reads 5 from _a) = 10`.
    *   **Initial State:** `label1` shows "10", `label2` shows "10".

2.  **Button Click (`changeConfig`)**:
    *   The button's `handler: 'up.changeConfig'` finds and calls the `changeConfig` method on the `MainContainer`.
    *   `this.set({a: 10, b: 10})` is called.
    *   `configSymbol` becomes `{a: 10, b: 10}`.
    *   `afterSetA` runs. It calculates `label1.text` as `value (10) + this.b (reads 10 from configSymbol) = 20`.
    *   `afterSetB` runs. It calculates `label2.text` as `value (10) + this.a (reads 10 from _a) = 20`.
    *   **New State:** `label1` shows "20", `label2` shows "20".

This example vividly demonstrates the dynamic and reactive nature of the system, where a single declarative state
change automatically propagates through the component logic.

## 5. Best Practices

*   **Embrace Declarativity:** Define your entire UI structure inside `static config` whenever possible. This improves
    readability and maintainability.
*   **Use the `_` Suffix Wisely:** Only add the trailing underscore to configs that need `afterSet`, `beforeSet` or
  `beforeGet` based logic. For simple value properties, omit it to avoid unnecessary overhead.
*   **Keep `afterSet` Handlers Pure:** An `afterSet` handler should ideally only react to the change of its own
    property and update other parts of the application. Avoid triggering complex chains of `set()` calls from within
    an `afterSet` if possible.
*   **Batch Updates with `set()`:** When you need to change multiple properties at once, always use a single
    `set({a: 1, b: 2})` call. This is more efficient and ensures consistency, as demonstrated above.
*   **Use `onConstructed` for Post-Construction Logic:** Use the `onConstructed` lifecycle method to perform any setup
    that depends on the instance's initial configuration being fully processed. This is the ideal place for logic that
    requires all configs to be set and potentially other instances to be created (if set-driven).

By understanding these internal mechanics and following best practices, you can leverage the full power of Neo.mjs's
class config system to build highly complex, reactive, and maintainable applications with confidence.
