# Async Destruction & The Trap Pattern

In single-page applications, handling the lifecycle of asynchronous operations is a critical challenge. A component might trigger a network request (like `fetch`) or a dynamic import, but be destroyed by the user (e.g., navigating away) before that operation completes.

If the callback for that operation attempts to modify the component's state (e.g., `this.setState()`, `this.vdom = ...`), it will likely throw an error because the instance no longer exists or is in a broken state. Worse, it can lead to memory leaks or "zombie" processes that consume resources unnecessarily.

Neo.mjs provides a robust, built-in mechanism to handle this: **The Trap Pattern**.

## The Problem: Zombie Callbacks

Consider this common scenario in a component or controller:

```javascript
// BAD: Unsafe async operation
async loadData() {
    // 1. Start a network request
    const response = await fetch('/api/data');
    const data     = await response.json();

    // 2. DANGER ZONE: 
    // If the component was destroyed while awaiting above,
    // 'this' might be destroyed. Calling setter methods or 
    // triggering updates will throw an error.
    this.items = data;
}
```

If `this.destroy()` is called while `fetch` is pending, the execution resumes after the `await` on a dead instance.

## The Solution: `this.trap()`

`Neo.core.Base`, the ancestor of almost every class in the framework (Components, Controllers, Stores), implements a method called `trap()`.

`trap()` acts as a lifecycle-aware guard for Promises.

1.  It wraps the Promise you pass to it.
2.  If the Promise resolves **while the component is alive**, it returns the result normally.
3.  If the component is **destroyed** (or currently destroying) before the Promise resolves, `trap()` **rejects** the Promise with a specific symbol: `Neo.isDestroyed`.

## Usage Examples

### Basic Fetch

Here is the corrected version of the previous example using `trap()`:

```javascript
// GOOD: Trapped async operation
async loadData() {
    let me = this, // 'me' reference is standard in Neo.mjs
        data;

    try {
        // Wrap the fetch promise
        const response = await me.trap(fetch('/api/data'));
        
        // Wrap the json parsing promise
        data = await me.trap(response.json());

        // Safe to use 'me' here, because trap() ensured we are still alive
        me.items = data;

    } catch (err) {
        // Gracefully handle the destruction case
        if (err !== Neo.isDestroyed) {
            console.error('Real error occurred:', err);
        }
        // If err === Neo.isDestroyed, we just stop. 
        // No further code executes, effectively killing the "zombie" logic.
    }
}
```

### Dynamic Imports

Dynamic imports are also asynchronous and should be trapped if the loaded module is used to update the instance.

```javascript
async loadChartEngine() {
    let me = this,
        module;

    try {
        // If the user closes the view while the chart engine is downloading,
        // this will reject, and we won't try to instantiate a chart on a dead view.
        module = await me.trap(import('amcharts/amcharts4.mjs'));
        
        me.chartEngine = module.default;
        me.renderChart();

    } catch (err) {
        if (err !== Neo.isDestroyed) {
            console.error('Failed to load chart engine', err);
        }
    }
}
```

### Promise.all

You can trap combined promises as well.

```javascript
async loadAllData() {
    let me = this;

    try {
        const [users, projects] = await me.trap(Promise.all([
            fetch('/api/users').then(r => r.json()),
            fetch('/api/projects').then(r => r.json())
        ]));

        me.store.users = users;
        me.store.projects = projects;

    } catch (err) {
        if (err !== Neo.isDestroyed) {
            throw err;
        }
    }
}
```

## Best Practices

1.  **Trap Early, Trap Often**: Wrap *every* asynchronous boundary that crosses into `this` context access.
2.  **Separate `fetch` and `json()`**: Both are async points. It is safest to trap them individually or chain them inside a single trapped promise if preferred.
3.  **Check `Neo.isDestroyed`**: In your `catch` block, always check if the error is `Neo.isDestroyed` to silence expected lifecycle interruptions.
4.  **Controllers**: `Neo.controller.Base` inherits from `core.Base`, so ViewControllers have full access to `trap()`. This is the most common place to use it for fetching view data.
5.  **Stores**: `Neo.data.Store` uses `trap()` internally for its `load()` method, but if you are implementing custom data loading logic in a store, you should use it too.

## Architecture Note

The `Neo.isDestroyed` symbol is globally available (assigned to `Neo` in `src/Neo.mjs`). The global error handler in `src/Neo.mjs` is also configured to ignore unhandled rejections if the reason is `Neo.isDestroyed`, ensuring your console remains clean of "Uncaught (in promise)" errors for valid lifecycle cancellations.
