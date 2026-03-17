# Instance Lifecycle & `initAsync`

While the `construct(config)` method replaces the native JS `constructor` to solve synchronous instantiation issues, modern web applications frequently require asynchronous initialization.

Neo.mjs provides a dedicated, promise-driven lifecycle phase to handle asynchronous setup before an instance is considered "ready" for use.

## The Lifecycle Sequence

When you call `Neo.create(MyClass, config)`, the framework orchestrates the following sequence in `src/core/Base.mjs`:

1. **`constructor()` (Native):** The native parameterless constructor runs, initializing all class fields.
2. **`construct(config)` (Synchronous):** The framework merges configs, initializes the reactive config system, and applies initial state.
3. **`onConstructed()` (Synchronous):** A hook for subclasses to perform logic immediately after the core construction is complete. The `isConstructed` flag is set to `true`.
4. **`init()` (Synchronous):** A secondary hook for synchronous initialization, often used by components to build their initial VDOM.
5. **`initAsync()` (Asynchronous):** The critical phase for async operations.
6. **`afterSetIsReady(true)` (Synchronous):** Fired once the promise returned by `initAsync` resolves.

## Why `initAsync` is Essential

A synchronous constructor cannot `await` an operation. If your component needs to fetch data from an API, dynamically import a heavy sub-module, or wait for a connection to another thread before rendering, you need an asynchronous initialization phase.

### The `isReady` Config

The `initAsync` method is intimately tied to the reactive `isReady_` config.

```javascript readonly
// Inside Neo.core.Base construct()
Promise.resolve().then(async () => {
    // Wait for the instance's async initialization to finish
    await me.initAsync();
    
    // Once finished, flip the reactive flag
    me.isReady = true;
});
```

Because `isReady_` is a reactive config, you can easily hook into it:

```javascript readonly
afterSetIsReady(value, oldValue) {
    if (value) {
        // The instance is now fully constructed AND has completed
        // all asynchronous setup (like dynamic imports).
        console.log('Instance is fully ready!');
        
        // If the Observable mixin is used, this also fires a 'ready' event
    }
}
```

### Remote Method Registration

One of the most critical built-in uses of `initAsync` is registering remote methods across the Worker architecture.

If an instance defines a `remote` config (e.g., exposing a method from the App Worker to the Main Thread), `initAsync` will wait until the necessary inter-process communication (IPC) messages have been sent and confirmed before resolving.

```javascript readonly
// Example override of initAsync in a custom class
async initAsync() {
    // 1. ALWAYS call super to ensure framework async setup (like remotes) finishes
    await super.initAsync();
    
    // 2. Perform custom async logic
    const data = await fetch('/api/config');
    this.serverConfig = await data.json();
    
    // Once this method completes, me.isReady becomes true
}
```

This ensures that when an instance fires its `ready` event, it is genuinely prepared to interact with the rest of the distributed application.