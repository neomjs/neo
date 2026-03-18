# Instance Lifecycle & `initAsync`

With our instance compiled by `setupClass` and wired with two-tier reactivity, it is logically complete. In a traditional, single-threaded JavaScript environment, once the constructor finishes, the object is considered ready. 

But Neo.mjs is not a traditional environment. It is a distributed, multi-threaded OS for the web. An instance might need to talk to a Service Worker, dynamically import a heavy charting library, or negotiate a connection with the Main Thread. True readiness requires an asynchronous lifecycle.

Neo.mjs provides a dedicated, promise-driven lifecycle phase to handle asynchronous setup before an instance is officially allowed to announce itself to the rest of the application.

## The Lifecycle Sequence

When you call `Neo.create(MyClass, config)`, the engine orchestrates a precise sequence in `src/core/Base.mjs` that spans both synchronous and asynchronous realms:

1. **`constructor()` (Native):** The native parameterless constructor runs, initializing all basic class fields.
2. **`construct(config)` (Synchronous):** The engine merges configs, initializes the reactive config system, and applies the initial state payload.
3. **`onConstructed()` (Synchronous):** A hook for subclasses to perform logic immediately after the core construction is complete. The `isConstructed` flag is set to `true`.
4. **`init()` (Synchronous):** A secondary hook for synchronous initialization, often used by components to build their initial VDOM tree.
5. **`initAsync()` (Asynchronous):** The critical phase for async operations. The engine pauses here.
6. **`afterSetIsReady(true)` (Synchronous):** Fired strictly *after* the promise returned by `initAsync` resolves.

## Why `initAsync` is Essential

A synchronous constructor cannot `await` an operation. Without an asynchronous initialization phase, components that rely on external data or cross-thread communication would fire events or render prematurely, leading to race conditions and broken UI states.

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

Because `isReady_` is a standard reactive config, you can easily hook into it to know when an object is truly alive:

```javascript readonly
afterSetIsReady(value, oldValue) {
    if (value) {
        // The instance is now fully constructed AND has completed
        // all asynchronous setup (like dynamic imports or Worker handshakes).
        console.log('Instance is fully ready for interaction!');
        
        // If the Observable mixin is used, this also fires a public 'ready' event
    }
}
```

### Remote Method Registration

One of the most critical, built-in uses of `initAsync` is registering remote methods across the Worker architecture.

If a singleton instance defines a `remote` config (e.g., exposing an App Worker method so the Main Thread can call it), `initAsync` will wait until the necessary inter-process communication (IPC) messages have been sent, received, and confirmed by the target thread before resolving.

```javascript readonly
// Example override of initAsync in a custom class
async initAsync() {
    // 1. ALWAYS call super to ensure engine async setup (like remotes) finishes first
    await super.initAsync();
    
    // 2. Perform custom async logic
    const data = await fetch('/api/config');
    this.serverConfig = await data.json();
    
    // Once this method completes, me.isReady becomes true
}
```

### Main Thread Addons & Lazy Loading

Another prime example is the Main Thread Addon system (`Neo.main.addon.Base`), which is used to wrap heavy third-party libraries like Mermaid.js, AmCharts, or Google Maps.

These addons must inject external `<script>` tags into the DOM and wait for the browser to fetch and parse them. If the App Worker tried to call a method like `mermaid.render()` or add a Google Maps marker before the script was fully loaded, the application would crash.

To solve this, the addon base class overrides `initAsync` to await a `loadFiles()` promise.

```javascript readonly
// Simplified from Neo.main.addon.Base
async initAsync() {
    await super.initAsync();
    
    // The engine pauses here until the external script 
    // is fully loaded and parsed by the browser.
    await this.#loadFilesPromise;
}
```

This elegant pause guarantees that the App Worker can confidently send remote messages to the addon without worrying about race conditions. If the addon hasn't finished its `initAsync` phase yet, it will seamlessly intercept and **queue the incoming remote messages**. 

The moment `initAsync` resolves and `isReady` flips to `true`, the addon processes the queued messages in order. From the developer's perspective in the App Worker, you can request to add a marker to a map instantly—"it just works", and the message is never lost.

This ensures that when an instance finally flips `isReady` to true and fires its `ready` event, it is genuinely prepared to interact with the distributed application safely.

The instance is finally alive, connected, and communicating across threads. This intricate dance of compilation, reactivity, and lifecycle management provides immense power. But in an engine capable of 40,000 delta updates per second, power requires rigorous efficiency.