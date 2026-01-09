# Worker Architecture & Messaging

Traditional web architectures face a fundamental constraint: everything competes for the same single thread. A heavy calculation locks your UI. A complex animation stutters during data processing.

Neo.mjs solves this by inverting the standard architecture. It moves your application logic, virtual DOM diffing, and data processing into separate worker threads, leaving the main thread almost entirely empty.

This guide explains the architectural implementation of these workers, how the engine abstracts their complexity, and the sophisticated messaging patterns that enable high-performance communication.

## The Worker Model

The engine orchestrates a specific set of threads, each with a dedicated purpose.

### 1. The Main Thread (Manager)
In Neo.mjs, the main thread's role is minimized. It acts as a "thin client" responsible for:
*   **Rendering:** Applying DOM updates received from workers.
*   **Events:** forwarding DOM events (clicks, keypresses) to the App worker.
*   **Orchestration:** Creating and managing the worker threads via `Neo.worker.Manager`.

It contains almost **no** application logic. This architecture ensures the UI can remain responsive (targeting 60fps) even when the application is performing expensive calculations.

### 2. The App Worker (The Brain)
This is where your code lives. The App worker hosts:
*   Component trees and their Virtual DOM (VDOM).
*   Controllers and ViewModels.
*   Application state.
*   Business logic.

### 3. The VDom Worker (The Diffing Engine)
A dedicated worker for comparing VDOM trees. When a component changes, the App worker sends the new VDOM structure to this worker. It calculates the minimum set of changes (deltas) required to update the real DOM.

### 4. The Data Worker
Handles data-intensive operations like sorting, filtering, and grouping large datasets inside `Neo.data.Store` instances. This prevents data crunching from blocking the UI logic in the App worker.

### 5. The Canvas Worker (Optional)
A specialized worker for handling `OffscreenCanvas`. It allows for high-performance graphics rendering (charts, visualizations) without impacting the rest of the application.

## Unified Worker Abstraction: `Neo.worker.Base`

One of the engine's most powerful features is its ability to switch between **Dedicated Workers** (`new Worker()`) and **Shared Workers** (`new SharedWorker()`) via the `useSharedWorkers` config, without requiring changes to application code.

**Guidance:**

*   **Dedicated Workers (Default):** Use for standard single-window applications. This mode offers simpler debugging, as logs appear directly in the main browser console.
*   **Shared Workers:** Enable `useSharedWorkers: true` when building multi-window applications where you want windows to share live state, or when you need synchronized state across multiple browser windows/tabs without network calls or local storage polling.

Critically, you can switch between these modes by changing a single config flag. This allows you to start developing a simple SPA using Dedicated Workers (for easier debugging) and later flip the switch to SharedWorkers to enable multi-window capabilities without rewriting your application logic.

This is achieved through `Neo.worker.Base`, an abstract base class that all specific worker implementations (App, Data, VDom) extend. It abstracts the underlying transport layer:

*   **Dedicated Mode:** Uses standard `postMessage` on the global scope.
*   **Shared Mode:** Handles the `onconnect` event and manages `MessagePort` instances for multiple connected windows.

This abstraction allows Neo.mjs to support advanced scenarios like **multi-window applications**, where multiple browser windows (Main threads) share the same App and Data workers (SharedWorkers), enabling synchronized state across windows out of the box.

## Message Routing & Channels

By default, workers in a browser cannot communicate directly with each other; they must route messages through the main thread. This creates a potential bottleneck. Neo.mjs solves this using **MessageChannels**.

### Initial Handshake
When the engine boots up, `Neo.worker.Manager` (in Main) facilitates an initial handshake to establish direct connections between workers.

1.  **Creation:** A worker (e.g., App) creates a `MessageChannel` containing two ports (`port1`, `port2`).
2.  **Retention:** The worker keeps `port1` for itself.
3.  **Transfer:** The worker sends `port2` to the Main thread, instructing it to transfer ownership to a target worker (e.g., Data).
4.  **Connection:** The target worker receives `port2`. Now, App and Data have a direct, private line of communication.

This allows high-frequency messages (like data loading or canvas updates) to bypass the Main thread entirely.

**Code Example (`Neo.worker.Canvas#afterConnect`):**
```javascript
afterConnect() {
    let me             = this,
        channel        = new MessageChannel(),
        {port1, port2} = channel;

    port1.onmessage = me.onMessage.bind(me);

    // Send port2 to the App worker (via Main)
    me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

    me.channelPorts.app = port1
}
```

## Communication Patterns

Neo.mjs uses several sophisticated messaging patterns to optimize performance and developer experience.

### 1. Remote Method Access (RMA): The "Magic" RPC
The engine provides a Remote Procedure Call (RPC) layer that allows code in one worker to call methods in another worker as if they were local, asynchronous functions.

**The Developer Experience:**
To a developer, there is **no difference** between calling a local asynchronous function and a remote method in another thread. You simply use `await`. The engine handles the complexities of serialization, message passing, and promise resolution transparently.

This effectively makes multi-threading **trivial**. You spend 95% of your time in the App Worker, writing standard JavaScript, while the engine orchestrates the distributed execution behind the scenes.

**How it works:**
1.  **Proxies:** The engine dynamically generates "stub" methods in the calling worker for classes exposed by the target worker.
2.  **Promises:** Calling a stub immediately returns a `Promise`.
3.  **Messaging:** Under the hood, `Neo.worker.mixin.RemoteMethodAccess` sends a message to the target worker.
4.  **Execution:** The target worker executes the real method and sends the result back.
5.  **Resolution:** The promise resolves with the return value.

**Example: Evolution of an API**

To measure a DOM element, you *could* call the Main thread directly using RMA. However, this requires manually handling the `id` and, crucially, the `windowId` for multi-window support.

```javascript
// 1. Raw RMA Call (Low Level)
// You must manually pass the node ID AND the windowId.
const rect = await Neo.main.DomAccess.getBoundingClientRect({
    id      : 'my-element-id',
    windowId: this.windowId // Critical for multi-window setups!
});
```

To simplify this, Neo.mjs components provide high-level abstractions that handle this boilerplate for you.

```javascript
// 2. Component Abstraction (Best Practice)
// The engine wraps the RMA call, handling scoping automatically.
// It even offers advanced variants like waitForDomRect() to handle async rendering timing.
const componentRect = await this.getDomRect();
```

### 2. The Triangular Communication (VDOM Updates)
For VDOM updates, the engine uses a specialized flow to minimize latency and main-thread overhead. Instead of a simple request-response, the data flows in a triangle:

1.  **App Worker:** Generates a new VDOM structure and sends it to the **VDom Worker**.
2.  **VDom Worker:** Calculates the deltas (diff) and sends a "reply" message.
3.  **Main Thread (Interception):** Crucially, the Main thread **intercepts** this reply. It sees the deltas, applies them to the DOM immediately via `Neo.worker.Manager.handleDomUpdate()`, and *then* forwards the success/failure confirmation to the App Worker.
4.  **App Worker:** Receives the confirmation and resolves the promise.

**Why?** This avoids an extra round-trip. If the VDom worker sent the diff back to the App worker, the App worker would then have to send it to the Main thread to be applied. The triangular path cuts out the middleman for the critical rendering path.

```text
   [App Worker]
        |
        | 1. VDOM Update
        v
   [VDom Worker]
        |
        | 2. Deltas (Diff)
        |
   [Main Thread] <--- 3. Intercept & Apply to DOM
        |
        | 4. Success Reply
        v
   [App Worker]
```

### 3. Direct MessageChannels (Peer-to-Peer)
For high-frequency or heavy payloads, direct channels are used.

*   **App <-> Canvas:** The App worker sends draw commands or data directly to the Canvas worker. This isolates the rendering loop from both the DOM (Main) and the business logic (App).
*   **App <-> Data:** Large datasets can be transferred directly without clogging the main thread's message queue.

## Multi-Window Architecture & Shared State

Because the App Worker can be a **SharedWorker**, it acts as a centralized hub for multiple browser windows (Main threads). This architecture enables capabilities that are impossible in single-threaded frameworks:

*   **Unified State:** All windows share the exact same JavaScript heap. Changes to a `Store` or `StateProvider` in one window are instantly available in all others without serialization or network calls.
*   **Component Teleportation (Instance Reusability):** Most frameworks only support reusing *classes* (rendering a new instance). Neo.mjs allows you to reuse **live instances**. You can unmount a component (removing its DOM) while keeping its JavaScript instance, state, and event listeners alive in the App Worker. Later, you can remount that exact same instance in a different location or even a different window.

    **Example:** Imagine a trading dashboard where you pop out a stock chart into a second monitor. The chart maintains its exact state—zoom level, selected indicators, even pending animations—because you're moving the live instance, not creating a copy.

**Lifecycle Management:**
The App worker monitors the lifecycle of connected windows via `connect` and `disconnect` events. Applications can listen to these events to dynamically adapt the UI, such as opening a "widget" window and moving a component into it.

```javascript
// Example: Moving a component to a new window when it connects
Neo.currentWorker.on('connect', (data) => {
    const
        app      = Neo.apps[data.windowId],
        mainView = app.mainView,
        widget   = this.getReference('my-widget');

    // "Adopt" the existing widget instance into the new window's main view
    mainView.add(widget);
});
```

## Debugging & Error Handling

Debugging multi-threaded applications might seem daunting, but modern tools make it manageable.

*   **Console Logs:** Logs from **Dedicated Workers** appear in the browser console. Chrome DevTools allows you to filter logs by "Context" (selecting specific workers).
*   **SharedWorker Logs:** For **SharedWorkers**, logs do *not* appear in the main console. You must visit `chrome://inspect/#workers` and click "Inspect" to open a dedicated DevTools window for that worker.
*   **Source Maps:** Neo.mjs runs directly in the browser (no transpilation in dev mode), so stack traces point directly to your source files in the correct worker.
*   **RMA Errors:** If a remote method throws an error, the engine catches it, serializes the stack trace, and rejects the Promise in the calling worker. The error message typically identifies which worker threw the exception. You can use `try/catch` blocks around RMA calls just like local async functions.
*   **Debugging Workers:** In Chrome DevTools, you can inspect dedicated workers under the "Sources" tab. For SharedWorkers, visit `chrome://inspect/#workers` to open a dedicated devtools window.

## Summary



The Neo.mjs worker system is designed to keep the Main thread idle and the application responsive. By combining a unified worker abstraction with optimized communication patterns like RMA, triangular routing, and direct MessageChannels, it provides a robust foundation for building complex, high-performance web applications that run smoothly on any device—from powerful desktops to mobile phones.
