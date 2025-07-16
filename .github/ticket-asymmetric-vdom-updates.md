# Epic: Optimized VDOM Update Strategies

This epic outlines a series of surgical enhancements to the framework's VDOM update lifecycle. The goal is to improve the robustness and maintainability of the update mechanism by centralizing complex state for all collision scenarios, without altering the existing high-performance, real-time messaging architecture.

## Core Problem: Distributed State
The current VDOM update logic is extremely fast, but the state management for aggregated updates is complex and distributed across component instances. This is true for two scenarios:
1.  **Pre-Flight Merges:** Multiple updates are queued in the same event loop tick and merged before a worker message is sent.
2.  **In-Flight Collisions:** A child requests an update while its parent's update is already in-flight to the worker.

In both cases, callbacks and post-update triggers are stored in scattered instance-level caches (`resolveUpdateCache`, `childUpdateCache`), making the lifecycle hard to debug and maintain.

## Solution: Centralized Orchestration Manager

We will introduce a new manager to act as a central orchestrator for all collision-related state. This approach preserves the existing high-performance update engine while drastically simplifying the `VdomLifecycle` mixin.

### 1. New Class: `Neo.manager.VDomUpdate` (Orchestrator)
-   This new singleton manager will **not** schedule or delay updates.
-   It will contain two maps to manage all collision scenarios:
    -   `mergedCallbackMap`: Stores callbacks for **pre-flight merges**.
    -   `postUpdateQueueMap`: Stores child components that need updating after an **in-flight collision**.
-   It will expose methods to be called by the `VdomLifecycle` mixin:
    -   `registerMerged(ownerId, childId, callbacks)`
    -   `registerPostUpdate(ownerId, childId)`
    -   `executeCallbacks(ownerId)`
    -   `triggerPostUpdates(ownerId)`

### 2. `VdomLifecycle.mjs` Refactoring
-   The core, high-performance update logic (`updateVdom`, collision detection) will remain.
-   **Pre-Flight Merge:** When an update is merged (e.g., in `mergeIntoParentUpdate()`), it will now call `Neo.manager.VDomUpdate.registerMerged(...)` instead of manipulating local caches.
-   **In-Flight Collision:** When an update collides with an in-flight parent (in `isParentUpdating()`), it will call `Neo.manager.VDomUpdate.registerPostUpdate(...)`. The child component will still set its own `needsVdomUpdate = true` and hold its own callback in its `resolveUpdateCache` for the update it will eventually run.
-   **On Update Completion:** When a root update cycle finishes, its `then()` block will call both `manager.executeCallbacks(this.id)` and `manager.triggerPostUpdates(this.id)`.
-   This change allows for the complete removal of the complex `childUpdateCache` property and simplifies the logic around `resolveUpdateCache`.

### 3. Asymmetric VDOM Serialization (`ComponentManager.mjs`)
-   This part of the plan remains crucial and unchanged.
-   `getVdomTree()` and `getVnodeTree()` will be refactored to honor the `updateDepth` of each individual component.
-   If a child component is excluded from an update, a lightweight placeholder object `{componentId: 'neo-ignore', id: childComponent.id}` will be inserted into the tree to preserve its structural integrity.

### 4. VDOM Worker Enhancement (`vdom/Helper.mjs`)
-   The VDOM worker's `createDeltas()` method will be enhanced to recognize the `neo-ignore` placeholder. When it encounters this node, it will skip the diffing process, leaving the corresponding DOM element untouched.

### 5. Testing Strategy
Given the architectural significance of these changes, a comprehensive testing strategy is required. Since the test environment runs in a single thread (main), the strategy will be:

1.  **Unit Test Environment Setup:**
    -   The test suite will import all necessary classes directly into the main thread: `vdom.Helper`, `manager.VDomUpdate`, and all relevant components and containers.
    -   Components will be instantiated in a non-rendering mode (`preventDOM: true` or a similar mechanism) to avoid any interaction with the actual DOM.

2.  **Validation Points:**
    -   **Aggregation Logic:** Create complex scenarios with nested components triggering updates simultaneously to verify that the new `VDomUpdate` manager correctly handles both pre-flight and in-flight collisions.
    -   **Delta Correctness:** After a test update cycle, inspect the generated `deltas` array to ensure it is correct and that the `neo-ignore` placeholder is working as expected.
    -   **VNode Redistribution:** Verify that after an update, the new `vnode` is correctly passed down and synchronized to all relevant child components.
    -   **Callback Execution:** Ensure that all `resolve` callbacks from merged and queued updates are executed correctly and exactly once.

3.  **Benchmarking:**
    -   A dedicated feature branch will be used for this epic.
    -   Create a suite of performance tests that simulate high-frequency updates on complex component trees.
    -   Run these benchmarks on both the `main` branch (old implementation) and the feature branch (new implementation) to rigorously compare performance and ensure there are no regressions.

This final, refined approach provides the best of all worlds: it fixes the code complexity and maintainability issues by centralizing all collision-related state, while fully preserving the framework's proven, real-time performance characteristics.