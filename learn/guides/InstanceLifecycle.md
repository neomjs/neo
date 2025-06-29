Understanding the lifecycle of a class instance in Neo.mjs is crucial for building robust and predictable
applications. The framework provides a series of well-defined hooks that allow you to tap into different stages of an
instance's life, from its creation to its destruction.

This guide will walk you through the entire lifecycle, starting with the initial synchronous steps and moving on to
the asynchronous parts and destruction.

## How the Lifecycle is Triggered

While this guide details the lifecycle methods of an instance, it's important to understand how that lifecycle begins.
In typical Neo.mjs application code, you will rarely call `Neo.create()` directly.

The most common way to create component instances is declaratively, by defining configuration objects within a container's
`items` array. The framework then internally uses `Neo.create()` to turn these configuration objects into fully-fledged
instances, automatically initiating their lifecycle.

It is crucial to **never** create a Neo.mjs class instance using the `new` keyword (e.g., `new MyComponent()`),
as this would bypass the entire lifecycle initialization process described below, resulting in a broken and
improperly configured instance. Always let the framework handle instantiation, either through declarative `items`
configs or, in less common cases, by using `Neo.create()` directly.

## 1. The Synchronous Creation Flow

When the framework creates a new instance, it executes a sequence of synchronous methods. This initial phase is
responsible for setting up the instance's basic configuration and state.

The synchronous lifecycle methods are called in the following order:

1.  **`new YourClass()`**: The framework first calls the actual JavaScript class constructor with **no arguments**.
    This is a crucial step. Its primary purpose is to create the instance and initialize all of its defined class
    fields. This ensures that by the time any Neo.mjs lifecycle method (like `construct`) or config hook
    (like `beforeGetX`) is called, all class fields are fully available on `this`, preventing potential race
    conditions or errors from accessing uninitialized properties.

2.  **`construct(config)`**: This is the first Neo.mjs lifecycle hook called on the new instance. Its primary role is
    to process the configuration object that was passed to `Neo.create()`. It's here that the initial values for
    your configs are processed and applied via the config system.

3.  **`onConstructed()`**: This hook is called immediately after `construct()` has finished. It's the ideal place to
    perform any setup that depends on the initial configuration, such as setting initial values for other
    properties or starting a process.

4.  **`onAfterConstructed()`**: This hook is called after `onConstructed()`. It provides another opportunity for
    setup logic, which can be useful for separating concerns or for logic that needs to run after the primary
    `onConstructed` logic has completed.

5.  **`init()`**: This is the final synchronous hook in the creation process. It's a general-purpose initialization
    method that you can use for any final setup tasks before the instance is returned by `Neo.create()`.

It's important to remember that all of these methods are synchronous. Any asynchronous operations should be handled
in the later, asynchronous phases of the lifecycle.

## 2. `constructor()` vs `construct()`: A Critical Distinction

While you *can* define a standard JavaScript `constructor()` method on a Neo.mjs class, it is strongly discouraged
and considered a bad practice. The framework provides the `construct()` lifecycle hook for a very specific and
powerful reason: **pre-processing configs**.

### The `constructor()` Limitation

In standard JavaScript class inheritance, you **cannot** access the `this` context in a constructor before calling
`super()`. This is a language-level restriction.

```javascript
// Anti-pattern: Do not do this in Neo.mjs
constructor(config) {
    // ERROR! 'this' is not available before super()
    console.log(this.someClassField); 

    super(config); // Assuming a parent constructor call
}
```

### The `construct()` Advantage

The `construct()` method, however, is just a regular method called by the framework *after* the instance has been
fully created (via `new YourClass()`). This means that inside `construct()`, you have full access to `this` from the
very first line.

This enables a powerful pattern: you can inspect or modify the incoming `config` object *before* passing it up the
inheritance chain with `super.construct(config)`. This is invaluable for component-specific logic.

```javascript
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

In summary, always use `construct()` for your initialization logic. It provides the flexibility needed to work
within the Neo.mjs lifecycle and config system, a flexibility that the standard `constructor()` cannot offer.

## 3. The Asynchronous Initialization Flow

After the synchronous creation methods are complete, the instance lifecycle moves into an asynchronous phase. This is
where you should place any logic that cannot be executed synchronously, such as loading external files, fetching
data from a server, or waiting for other resources to become available.

This phase is orchestrated by a microtask scheduled from within the `construct()` method.

### `initAsync()`: The Asynchronous Entry Point

The core of this phase is the `async initAsync()` method.

*   **Scheduling**: Immediately after the synchronous `construct()` logic is finished, the framework schedules a
    microtask (`Promise.resolve().then(...)`) that will execute after the current JavaScript execution block is empty.
*   **Execution**: This microtask calls and `await`s the `initAsync()` method. This is the designated place for all
    asynchronous initialization logic. You can override this method in your own classes to perform tasks like
    dynamic imports or initial data fetching.
*   **Parent Call**: When overriding `initAsync()`, it is crucial to call `await super.initAsync()` at the beginning
    of your implementation to ensure that parent classes can perform their own asynchronous setup, such as
    registering remote methods.

```javascript
// In your component class
async initAsync() {
    // Always call the parent method first!
    await super.initAsync();

    // Your async logic here
    const myModule = await import('./MyOptionalModule.mjs');
    this.data = await myService.fetchInitialData();
}
```

### `isReady`: The Signal of Completion

Once the `initAsync()` promise resolves, the framework sets the instance's `isReady` config to `true`.

*   **`isReady_`**: The config is defined as `isReady_` (with a trailing underscore), which means it gets an
    `afterSetIsReady(value, oldValue)` hook.
*   **Reacting to Readiness**: You can implement the `afterSetIsReady()` method to be notified precisely when the
    instance is fully initialized and ready for interaction. This is the most reliable way to coordinate logic that
    depends on the component's full readiness.

```javascript
// In your component class
afterSetIsReady(isReady, wasReady) {
    if (isReady && !wasReady) {
        console.log('The instance is now fully ready!');
        // Perform actions that require the component to be fully initialized
    }
}
```

This `initAsync` -> `isReady` pattern provides a robust and predictable way to manage the asynchronous parts of the
instance lifecycle, ensuring that dependent logic only runs when the instance is in a known, ready state.