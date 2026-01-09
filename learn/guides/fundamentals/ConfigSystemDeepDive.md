# Config System Deep Dive

**Pre-requisite:** It is highly recommended to study [The Unified Class Config System](#/learn/benefits.ConfigSystem)
first to understand the foundational concepts and benefits.

The Neo.mjs class configuration system is a cornerstone of the engine, providing a powerful, declarative, and
reactive way to manage the state of your components and classes. With the introduction of functional components in v10,
this system has evolved into a sophisticated, two-tier reactivity model that combines the robustness of a classic
"push" system with the fine-grained efficiency of a modern "pull" system.

This guide will take you on a deep dive into how this hybrid system works, giving you the knowledge to build highly
performant and maintainable applications.

## Tier 1: The Classic "Push" System

The original reactivity model in Neo.mjs is a "push" system. It's imperative, meaning that when you change a value,
the system actively "pushes" that change through a series of predefined lifecycle hooks. This system remains a core
part of v10 and is the foundation for class-based components.

### 1. Core Concepts Recap

At its heart, the push system is built on a few key principles:

*   **`static config` Block:** All configurable properties of a class are declared in a `static config = {}` block.
    This provides a single, clear source of truth for a class's API.
*   **`_` Suffix Convention:** Config properties that require custom logic when they change are declared with a trailing
    underscore (e.g., `myValue_`). This signals the engine to automatically create a native getter and setter on the
    class's prototype for this property.
*   **Lifecycle Hooks:** For a config like `myValue_`, the engine provides optional lifecycle hooks that you can
    implement in your class:
    *   `beforeGetMyValue(value)`: Called before the getter returns the value.
    *   `beforeSetMyValue(value, oldValue)`: Called before the setter applies the new value.
    *   `afterSetMyValue(value, oldValue)`: Called after the setter has applied the new value.
*   **Reactivity:** The `afterSet` hooks are the heart of the reactive system. They allow you to define logic that
    automatically runs whenever a specific config property changes, ensuring your UI and application state are always
    in sync.

### 2. The Internal Mechanics: `set()`, `processConfigs()`, and `configSymbol`

To truly understand how Neo.mjs handles complex scenarios like simultaneous updates and inter-dependencies, we must
look at the internal machinery: the `set()` and `processConfigs()` methods in `Neo.core.Base`, and the special
`configSymbol` object.

#### The `set()` Method: Your Gateway to Updates

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

#### The `processConfigs()` Method: The Heart of the Operation

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

### 3. Solving the "Circular Reference" Problem

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

## Tier 2: The Declarative "Pull" System (v10+)

With the introduction of functional components, Neo.mjs now includes a "pull" reactivity system. This system is
declarative and optimized for fine-grained updates, making it ideal for modern, state-driven UI development. Instead
of "pushing" changes through hooks, the system "pulls" data as needed, automatically tracking dependencies and
re-running computations only when necessary.

This tier is powered by three key classes: `Neo.core.Config`, `Neo.core.Effect`, and `EffectManager`.

### 1. `Neo.core.Config`: The Atomic Unit of State

A `Neo.core.Config` instance is a lightweight wrapper around a single, reactive piece of data. Think of it as an
"atom" of state.

*   **Value Storage:** It holds the current value of a config property.
*   **Subscription Management:** It maintains a list of subscribers (effects or other logic) that depend on its value.
*   **Dependency Tracking:** When its `get()` method is called within a reactive context (an "effect"), it registers
    itself as a dependency of that effect.
*   **Notification:** When its `set()` method is called and the value changes, it notifies all its subscribers,
    triggering them to re-run.

### 2. `Neo.core.Effect`: The Reactive Computation

An `Neo.core.Effect` represents a reactive computation—a function that depends on one or more `Config` atoms.

*   **Wrapping a Function:** It wraps a function (e.g., a component's rendering logic).
*   **Automatic Dependency Tracking:** When the effect runs, it automatically detects which `Config` atoms are `get()`
    inside its function. It then subscribes to them.
*   **Automatic Re-execution:** If any of its dependencies change (i.e., their `set()` method is called), the effect's
    function is automatically re-executed, ensuring the computation is always up-to-date.

### 3. `EffectManager`: The Global Coordinator

The `EffectManager` is a singleton that orchestrates the entire pull system.

*   **Effect Stack:** It maintains a stack of currently running effects. This is how a `Config` atom knows which effect
    to register itself with when its `get()` method is called.
*   **Batching:** It provides `Neo.batch()`, a crucial optimization function. It allows the system to pause effect
    re-runs, perform multiple state changes, and then resume, running all affected effects only once at the end. This
    prevents "glitches" and unnecessary intermediate computations.

### 4. `createVdom` as a Master Effect

In a functional component, the `createVdom()` method is the perfect example of an effect in action.

*   **The `vdomEffect`:** When a functional component is constructed, the engine automatically wraps its `createVdom()`
    method in a `Neo.core.Effect`.
*   **Reading is Subscribing:** When your `createVdom()` function runs, every component config you access (e.g.,
    `config.text`, `config.items`) is a call to that config's underlying `Neo.core.Config` atom's `get()` method.
    This automatically subscribes the `vdomEffect` to those configs.
*   **Automatic UI Updates:** If any of those configs change later, they notify the `vdomEffect`. The effect then
    re-runs your `createVdom()` function, generating a new virtual DOM based on the new state. The engine then
    efficiently diffs this new VDOM with the old one and applies the minimal necessary changes to the actual DOM.

This is the essence of declarative, state-driven UI. You declare what the UI should look like for a given state, and
the engine handles the "how" and "when" of updating it.

## The Bridge: How "Push" and "Pull" Work Together

The true power of the v10 config system is how these two tiers are seamlessly integrated. This bridge is forged in
the auto-generated setters of reactive configs and the `set()` method of `Neo.core.Base`.

When you change a config on any component (class-based or functional):

```javascript readonly
myComponent.myConfig = 'new value';
// or
myComponent.set({myConfig: 'new value'});
```

Here's what happens under the hood:

1.  **Batching Begins:** The `set()` method in `Neo.core.Base` immediately calls `EffectManager.pause()`. This tells
    the "pull" system to queue up any effects that get triggered but not to run them yet.
2.  **The Setter is Called:** The auto-generated setter for `myConfig` is invoked. This setter is the heart of the
    bridge. It performs two critical actions:
    *   **Pull System Update:** It retrieves the `Neo.core.Config` instance for `myConfig` (using `this.getConfig('myConfig')`)
      and calls its `set()` method with the new value. This updates the reactive atom and queues any dependent effects
      (like a functional component's `vdomEffect`).
    *   **Push System Update:** It proceeds with the classic "push" system logic, adding the new value to the
      `configSymbol` staging area and eventually calling the `afterSetMyConfig()` hook.
3.  **Batching Ends:** After the `set()` method in `core.Base` has finished processing all configs in the batch, its
    `finally` block calls `EffectManager.resume()`. This tells the `EffectManager` to run all the unique effects that
    were queued during the operation, ensuring that the UI and other reactive computations update exactly once.

This elegant integration means you get the best of both worlds: the predictable, hook-based logic of the push system
and the automatic, fine-grained reactivity of the pull system, all working in harmony.

## In-depth Example: A Reactive `MainContainer`

Let's analyze a practical example to see these concepts in action. The `Neo.examples.core.config.MainContainer`
demonstrates how to build a reactive UI declaratively using the classic "push" system.

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

This example vividly demonstrates the dynamic and reactive nature of the "push" system, where a single declarative state
change automatically propagates through the component logic via `afterSet` hooks.

## Best Practices for the Hybrid System

*   **Embrace Declarativity:** For functional components, define your UI structure inside `createVdom`. Trust the
    reactive system to handle updates. For class-based components, define your entire UI structure inside `static config`
    whenever possible. This improves readability and maintainability.
*   **Use the `_` Suffix Wisely:** Only add the trailing underscore to configs that need `afterSet`, `beforeSet` or
  `beforeGet` based logic. For simple value properties, omit it to avoid unnecessary overhead.
*   **Keep `afterSet` Handlers Pure:** An `afterSet` handler should ideally only react to the change of its own
    property and update other parts of the application. Avoid triggering complex chains of `set()` calls from within
    an `afterSet` if possible.
*   **Batch Updates with `set()`:** When you need to change multiple properties at once, always use a single
    `set({a: 1, b: 2})` call. This is more efficient and ensures consistency across both reactivity systems.
*   **Use `onConstructed` for Post-Construction Logic:** Use the `onConstructed` lifecycle method to perform any setup
    that depends on the instance's initial configuration being fully processed. This is the ideal place for logic that
    requires all configs to be set and potentially other instances to be created (if set-driven).
*   **Understand Your Dependencies:** Be mindful of which configs you access inside `createVdom` and other effects, as
    this determines when they will re-run.

By understanding these internal mechanics and following best practices, you can leverage the full power of Neo.mjs's
hybrid config system to build highly complex, reactive, and maintainable applications with confidence.
