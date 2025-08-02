# Instance Lifecycle

Understanding the lifecycle of a class instance in Neo.mjs is crucial for building robust and predictable
applications. The framework provides a series of well-defined hooks that allow you to tap into different stages of an
instance's life, from its creation and rendering to its destruction.

This guide will walk you through the entire lifecycle, which can be broken down into four main phases:

1.  **Synchronous Creation**: The initial, synchronous setup of the instance and its configuration.
2.  **Asynchronous Initialization**: An optional phase for asynchronous tasks like data fetching.
3.  **Mounting & Unmounting**: The dynamic phase where a component is initialized and mounted into the DOM, and potentially unmounted
    and re-mounted.
4.  **Destruction**: The final cleanup phase.

## How the Lifecycle is Triggered

While this guide details the lifecycle methods of an instance, it's important to understand how that lifecycle begins.
In typical Neo.mjs application code, you will rarely call `Neo.create()` directly.

The most common way to create component instances is declaratively, by defining configuration objects within a container's
`items` array. The framework then internally uses `Neo.create()` to turn these configuration objects into fully-fledged
instances, automatically initiating their lifecycle.

It is crucial to **never** create a Neo.mjs class instance using the `new` keyword (e.g., `new MyComponent()`), as this
would bypass the entire lifecycle initialization process described below, resulting in a broken and improperly configured
instance. Always let the framework handle instantiation.

## 1. The Synchronous Creation Flow

When the framework creates a new instance, it executes a sequence of synchronous methods. This initial phase is
responsible for setting up the instance's basic configuration and state. **At this stage, the component has not been
mounted to the DOM.**

The synchronous lifecycle methods are called in the following order:

1.  **`new YourClass()`**: The framework first calls the actual JavaScript class constructor with **no arguments**.
    Its primary purpose is to create the instance and initialize all of its defined class fields. This ensures that by
    the time any Neo.mjs lifecycle method is called, all class fields are fully available on `this`.

2.  **`construct(config)`**: This is the first Neo.mjs lifecycle hook. Its primary role is to process the configuration
    object passed to `Neo.create()`. It's here that the initial values for your configs are processed and applied via
    the config system.

3.  **`onConstructed()`**: This hook is called immediately after `construct()` has finished. It's the ideal place to
    perform any setup that depends on the initial configuration. **Crucially, do not attempt to access the DOM here**,
    as the component is not yet mounted.

4.  **`onAfterConstructed()`**: This hook is called after `onConstructed()`. It provides another opportunity for setup logic.

5.  **`init()`**: This is the final synchronous hook in the creation process. It's a general-purpose initialization
    method for any final setup tasks.

### `constructor()` vs `construct()`: A Critical Distinction

While you *can* define a standard JavaScript `constructor()` method on a Neo.mjs class, it is strongly discouraged and
considered a bad practice. The framework provides the `construct()` lifecycle hook for a very specific and powerful
reason: **pre-processing configs**.

#### The `constructor()` Limitation

In standard JavaScript class inheritance, you **cannot** access the `this` context in a constructor before calling
`super()`. This is a language-level restriction.

```javascript readonly
// Anti-pattern: Do not do this in Neo.mjs
constructor(config) {
    // ERROR! 'this' is not available before super()
    console.log(this.someClassField);

    super(config); // Assuming a parent constructor call
}
```

#### The `construct()` Advantage

The `construct()` method, however, is just a regular method called by the framework *after* the instance has been fully
created (via `new YourClass()`). This means that inside `construct()`, you have full access to `this` from the very first line.

This enables a powerful pattern: you can inspect or modify the incoming `config` object *before* passing it up the
inheritance chain with `super.construct(config)`. This is invaluable for component-specific logic.

```javascript readonly
// The correct Neo.mjs pattern
construct(config) {
    // 'this' is fully available here!
    // We can inspect the config and perform logic before the parent class does.
    if (config.someFlag) {
        config.title = 'Title set by child class';
        this.someProperty = true;
    }

    // Now, pass the (potentially modified) config to the parent.
    super.construct(config);
}
```

In summary, always use `construct()` for your initialization logic. It provides the flexibility needed to work within
the Neo.mjs lifecycle and config system, a flexibility that the standard `constructor()` cannot offer.

## 2. The Asynchronous Initialization Flow

After the synchronous creation methods are complete, the instance lifecycle moves into an optional asynchronous phase.
This is where you should place any logic that cannot be executed synchronously, such as loading external files or fetching data.

### `initAsync()`: The Asynchronous Entry Point

The core of this phase is the `async initAsync()` method. It is scheduled as a microtask from within `construct()`.

*   **Execution**: This microtask calls and `await`s `initAsync()`. This is the designated place for all asynchronous
    initialization logic. When overriding `initAsync()`, it is crucial to call `await super.initAsync()` at the
    beginning of your implementation.

```javascript readonly
// In your class
async initAsync() {
    // Always call the parent method first!
    await super.initAsync();

    // Your async logic here, wrapped in a try...catch block
    try {
        const myModule = await import('./MyOptionalModule.mjs');
        this.data = await myService.fetchInitialData();
    } catch (e) {
        console.error('Failed to initialize component asynchronously', e);
        // Handle the error appropriately, e.g., by setting an error state on the component.
    }
}
```

**Important**: If the `initAsync()` method throws an error, the `isReady` flag will never be set to `true`. It is crucial
to wrap your asynchronous logic in `try...catch` blocks to handle potential failures gracefully.

### `isReady`: The Signal of Completion

Once the `initAsync()` promise resolves successfully, the framework sets the instance's `isReady` config to `true`.

*   **`isReady_`**: The config is defined as `isReady_`, which means it gets an `afterSetIsReady(value, oldValue)` hook.
*   **Reacting to Readiness**: You can implement `afterSetIsReady()` to be notified precisely when the instance is fully
* initialized and ready for interaction. This is the most reliable way to coordinate logic that depends on the
* component's full readiness.

```javascript readonly
// In your class
afterSetIsReady(isReady, wasReady) {
    if (isReady && !wasReady) {
        console.log('The instance is now fully ready!');
        // Perform actions that require the component to be fully initialized
    }
}
```

## 3. The Mounting Phase: Interaction with the DOM

This phase is what truly sets Neo.mjs apart. A component's lifecycle is not complete after initialization; it only
becomes fully interactive once it is **mounted** into the DOM. Furthermore, a component can be unmounted and re-mounted
multiple times, even into different browser windows, all while preserving its instance and state.

### `mounted`: The DOM-Ready Signal

The `mounted_` config is the key to this phase. It is a boolean flag that indicates whether the component is currently
painted in the DOM.

*   **`afterSetMounted(isMounted, wasMounted)`**: This is the most important hook for DOM interaction. It is called with
* `true` when the component's VDOM is successfully initialized and mounted into the DOM, and with `false` when it is removed.

**This is the only safe and reliable place to perform DOM measurements or manipulations.**

```javascript readonly
// In your component class
afterSetMounted(isMounted, wasMounted) {
    if (isMounted) {
        console.log('Component is now in the DOM!');
        // It is now safe to measure this.vnode.dom
        const rect = this.vnode.dom.getBoundingClientRect();
        console.log('Component dimensions:', rect.width, rect.height);
    } else {
        console.log('Component was removed from the DOM.');
    }
}
```

### The Re-Mounting Lifecycle

Because a component can be removed from a container and added back later, the `afterSetMounted` hook can fire multiple
times. This allows you to correctly manage DOM-related resources, such as third-party libraries or complex event
listeners, that need to be created and destroyed in sync with the component's presence in the DOM.

### Multi-Window Mounting

Neo.mjs's multi-window support adds another layer to this phase. A component can be unmounted from one browser window
and re-mounted into another. The framework manages this through the `windowId_` config.

*   **`windowId_`**: This config tracks which browser window the component currently belongs to.
*   **`afterSetWindowId(newWindowId, oldWindowId)`**: This hook is called when a component is moved between windows.
* You can use it to manage any window-specific resources or logic.

## 4. Destruction: Cleaning Up with `destroy()`

The final phase of the instance lifecycle is destruction. Properly cleaning up instances when they are no longer needed
is critical for preventing memory leaks and ensuring your application remains performant over time. The `destroy()`
method is the designated entry point for all cleanup logic.

### The Base `destroy()` Implementation

The `Neo.core.Base` class provides a foundational `destroy()` method that performs several key actions:

*   **Clears Timeouts**: It clears any pending timeouts that were created using `this.timeout()`.
*   **Unregisters Instance**: It unregisters the instance from the global `Neo.manager.Instance`, so it can no longer
    be looked up by its ID.
*   **Property Deletion**: It iterates over all properties of the instance and deletes them. This is an aggressive
    strategy to help the JavaScript garbage collector reclaim memory by breaking references.
*   **Single-Execution Guard**: The base class automatically intercepts the `destroy()` method to ensure that its core
    logic can only be executed **once**, even if `destroy()` is called multiple times.

### Overriding `destroy()`: Best Practices

When your class holds references to other Neo.mjs instances or external resources, you must override the `destroy()`
method to manage them correctly. The primary goal is to break all circular references and remove any listeners or
registrations so that the instance can be safely garbage collected.

Here is an example from `Neo.grid.Container` that illustrates key best practices:

```javascript readonly
// Example from src/grid/Container.mjs
destroy(...args) {
    let me = this;

    // 1. Clean up SHARED instances (e.g., Stores)
    // We don't destroy the store, as it might be used by other components.
    // Setting it to null will trigger the afterSetStore hook, which is the
    // correct place to remove any listeners this grid added to the store.
    me.store = null;

    // 2. Destroy OWNED instances
    // The grid container creates and owns its scrollManager, so it's
    // responsible for destroying it.
    me.scrollManager.destroy();

    // 3. Unregister from external services/managers
    // The component had previously registered with the ResizeObserver addon.
    // It must unregister to prevent the addon from holding a dead reference.
    me.mounted && Neo.main.addon.ResizeObserver.unregister({
        id      : me.id,
        windowId: me.windowId
    });

    // 4. ALWAYS call super.destroy() LAST
    // This executes the base cleanup logic after your custom logic is complete.
    super.destroy(...args);
}
```

To summarize the best practices:

1.  **Call `super.destroy()` Last**: Always end your `destroy()` method with `super.destroy(...args)`. If you call it
    first, `this` will be partially dismantled, and subsequent calls on it will likely fail.
2.  **Destroy Owned Instances**: If your class creates its own instances of other Neo.mjs classes (e.g., helpers,
    managers), you are responsible for calling `destroy()` on them.
3.  **Clean Up Shared Instances**: If your class uses a shared instance (like a `Store` or a global service), do **not**
    call `destroy()` on it. Instead, remove any listeners you added to it. A good pattern is to set the config property
    to `null` (e.g., `this.store = null`) and perform the listener cleanup inside the `afterSet` hook.
4.  **Unregister from Services**: If your class registered itself with any external manager or service (like the
    `ResizeObserver`), be sure to unregister from it.

## 5. Lifecycle of Nested Instances: Set-Driven vs. Get-Driven

A powerful feature of the config system is that a config property can be another Neo.mjs class instance. A common
example is a grid's `selectionModel`. This raises an important architectural question: when should this nested instance
be created? The framework supports two patterns, each with different implications for the lifecycle.

### The Set-Driven Approach (Eager Instantiation)

In this pattern, you ensure the instance is created as soon as the config is set. This is typically done inside a `beforeSet` hook.

The `Neo.grid.Body` class provides a perfect example with its `selectionModel_` config.

```javascript readonly
// In Neo.grid.Body
beforeSetSelectionModel(value, oldValue) {
    oldValue?.destroy();

    // beforeSetInstance ensures the value is a valid instance,
    // creating one from a config object if necessary.
    return ClassSystemUtil.beforeSetInstance(value, RowModel);
}
```

When the framework processes the grid body's configs during its `construct` phase, `beforeSetSelectionModel` is called.
It immediately creates the selection model instance.

**The key takeaway is the guarantee this provides for `onConstructed()`**. Because the selection model was instantiated
during `construct`, by the time `onConstructed()` is called, you can safely assume the instance exists.

```javascript readonly
// In Neo.grid.Body
onConstructed() {
    super.onConstructed();

    // This is safe because beforeSetSelectionModel already created the instance.
    this.selectionModel?.register(this);
}
```

Use the set-driven approach when a nested instance is **essential** for the component's core functionality and needs to
be available immediately after construction.

### The Get-Driven Approach (Lazy Instantiation)

Alternatively, you can defer the creation of a nested instance until it's actually needed for the first time. This is
achieved by creating the instance within a `beforeGet` hook. This "lazy" approach can improve initial creation
performance if the nested instance is complex or not always used.

`Neo.grid.Body` also demonstrates this pattern with its `columnPositions_` config.

```javascript readonly
// In Neo.grid.Body
beforeGetColumnPositions(value) {
    // If the backing field (_columnPositions) is null...
    if (!value) {
        // ...create the instance now.
        this._columnPositions = value = Neo.create({
            module     : Collection,
            keyProperty: 'dataField'
        });
    }
    return value;
}
```

With this pattern, the `columnPositions` collection is **not** created during the `construct` phase. It is only
instantiated the very first time some other code calls `this.columnPositions`.

Use the get-driven approach for non-essential or heavy nested instances to optimize performance and memory usage,
especially if they are only used in specific scenarios.
