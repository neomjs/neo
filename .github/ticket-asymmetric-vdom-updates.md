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
    -   `mergedCallbackMap`: Stores callbacks and relevant update depth information for **pre-flight merges**.
    -   `postUpdateQueueMap`: Stores child components that need updating after an **in-flight collision**.
-   It will expose methods to be called by the `VdomLifecycle` mixin:
    -   `registerMerged(ownerId, childId, callbacks, childUpdateDepth, distance)`: Stores the child's callbacks, its `updateDepth`, and its `distance` from the owner.
    -   `registerPostUpdate(ownerId, childId, resolve)`
    -   `executeCallbacks(ownerId)`: This method will also be responsible for calculating the maximum required `updateDepth` for the `ownerId` (parent) based on the `childUpdateDepth` and `distance` of all merged children. It will then set the `ownerId` component's `updateDepth` to this calculated maximum *before* the parent's `update()` method is called (if `needsVdomUpdate` is true).
    -   `triggerPostUpdates(ownerId)`

### 2. `VdomLifecycle.mjs` Refactoring
-   The core, high-performance update logic (`updateVdom`, collision detection) will remain.
-   **Pre-Flight Merge:** When an update is merged (e.g., in `mergeIntoParentUpdate()`), it will now call `Neo.manager.VDomUpdate.registerMerged(parent.id, me.id, me.resolveUpdateCache, me.updateDepth, distance)` instead of manipulating local caches.
-   **In-Flight Collision:** When an update collides with an in-flight parent (in `isParentUpdating()`), it will call `Neo.manager.VDomUpdate.registerPostUpdate(...)`. The child component will still set its own `needsVdomUpdate = true` and hold its own callback in its `resolveUpdateCache` for the update it will eventually run.
-   **On Update Completion:** When a root update cycle finishes, its `then()` block will call both `manager.executeCallbacks(this.id)` and `manager.triggerPostUpdates(this.id)`.
-   This change allows for the complete removal of the complex `childUpdateCache` property and simplifies the logic around `resolveUpdateCache`.

### 3. Asymmetric VDOM Serialization (`ComponentManager.mjs`)
-   This part of the plan remains crucial and unchanged.
-   `getVdomTree()` and `getVnodeTree()` will be refactored to honor the `updateDepth` of each individual component.
-   If a child component is excluded from an update, a lightweight placeholder object `{componentId: 'neo-ignore'}` will be inserted into the tree to preserve its structural integrity.

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

## Implementation Progress

**Status:** Foundational work complete. Documentation and a regression test suite are in place, and key framework APIs have been enhanced.

### 1. Documentation & Test Suite

Two crucial files have been created to guide and validate this epic:

-   **Epic Ticket (`.github/ticket-asymmetric-vdom-updates.md`):** This central document outlines the problem, defines the solution, and tracks our progress.
-   **`VdomAsymmetricUpdates.mjs`:** A low-level unit test that directly validates the core logic of the new `VDomUpdate` manager and `TreeBuilder`. It simulates asymmetric updates with mock components to ensure the delta generation is correct.
-   **`VdomRealWorldUpdates.mjs`:** A high-level integration test using real components to create a regression suite. It verifies that the framework's *existing* ability to merge updates from multiple component levels into a single, efficient cycle remains intact.

Key achievements of these tests:
-   **Validates Current Logic:** It successfully tests the *existing* logic where updates from multiple component levels (e.g., a parent and a grandchild) within the same event loop tick are correctly merged into a single, efficient VDOM update cycle.
-   **Pure VDOM Testing:** The test runs without a real DOM. It creates component instances, generates their initial `vnode` structure, and then programmatically triggers updates.
-   **Asserts on Deltas:** Instead of inspecting the DOM, the test awaits the `promiseUpdate()` method (which was enhanced to resolve with the update data) and directly inspects the raw `deltas` array. This provides a precise and reliable way to verify that the update-merging logic is working as expected.

This test now serves as a critical regression suite, ensuring that the planned refactoring of the update mechanism will not alter this core, high-performance behavior.

### 2. Framework API Enhancements

The process of building the test suite revealed opportunities to improve the core framework. The following enhancements have been implemented:

-   **`Component.mountedPromise`:** A new, robust `mountedPromise` getter has been added to `component.Base`. This provides a clean, reusable, promise-based API for awaiting a component's mounted state. The implementation is resilient to the framework's full lifecycle, correctly handling unmounting and remounting, making it a valuable tool for both testing and application-level code.
-   **`VdomLifecycle.promiseUpdate()` Enhancement:** The `promiseUpdate()` method was refactored to resolve with the full data object from `vdom.Helper.update()`, giving developers and tests access to the generated `deltas` and the new `vnode`.
-   **Environment Robustness:** Several fixes were made to the `VdomLifecycle` mixin to ensure it works reliably in both multi-threaded (worker) and single-threaded (test) environments, particularly around `vdom.Helper` calls and `Neo.currentWorker` access.

-   **`VdomLifecycle.promiseUpdate()` Enhancement:** The `promiseUpdate()` method was refactored to resolve with the full data object from `vdom.Helper.update()`, giving developers and tests access to the generated `deltas` and the new `vnode`.
-   **Environment Robustness:** Several fixes were made to the `VdomLifecycle` mixin to ensure it works reliably in both multi-threaded (worker) and single-threaded (test) environments, particularly around `vdom.Helper` calls and `Neo.currentWorker` access.

## Comparison with `dev` Branch (based on PR #7077)

This feature branch represents a major architectural enhancement to the VDOM update lifecycle. Here is a summary of the key changes compared to the `dev` branch:

-   **New Update Orchestration Core:**
    -   `manager.VDomUpdate`: A new singleton manager has been introduced to centralize the state for both pre-flight update merges and in-flight update collisions.
    -   `util.vdom.TreeBuilder`: A new utility class for recursively building VDOM and VNode trees. It is the engine behind creating the *asymmetric* trees needed for optimized updates, correctly expanding component references based on a calculated `updateDepth`.

-   **Core Framework Refactoring:**
    -   `mixin/VdomLifecycle.mjs`: This critical mixin has been significantly refactored. The complex, distributed state management (`childUpdateCache`) has been removed, and it now delegates all collision and merge logic to the new `VDomUpdate` manager.
    The `executeVdomUpdate()` method has been modernized to use `async/await`, making the control flow more robust and readable, and ensuring deltas are correctly applied in non-worker environments.
    -   `vdom/Helper.mjs`: The diffing engine has been enhanced to support the new asymmetric update strategy.
    -   `component/Base.mjs`: The base component has been improved with a robust `mountedPromise` for easier async handling and other lifecycle enhancements to support the new update model.
    -   `manager/Component.mjs`: Has undergone significant refactoring to align with the new VDOM strategies.
    -   `functional/component/Base.mjs`: The base for functional components has been updated to align with the lifecycle changes in `component.Base`.

-   **New Testing Infrastructure:**
    -   `test/siesta/tests/vdom/VdomAsymmetricUpdates.mjs`: A new low-level test suite that directly validates the logic of `VDomUpdate` and `TreeBuilder` using mock components.
    -   `test/siesta/tests/vdom/VdomRealWorldUpdates.mjs`: A new high-level integration test suite using real, nested components to serve as a regression test.
    -   `src/DefaultConfig.mjs`: The new `allowVdomUpdatesInTests: true` flag has been added to facilitate running VDOM-related tests in a unit test environment.
    -   `test/siesta/siesta.js`: The test runner has been updated to include these new test suites.

### Remaining Work to Complete the Epic (as of this PR)

While the core architectural shift is complete, the following tasks remain to finalize the epic:

-   **Finalize Cleanup:**
    -   The `childUpdateCache` property inside `src/component/Base.mjs` is now obsolete. It can be safely removed, as `VDomUpdate` has taken over its responsibilities.
    -   The `updateVdom()` method in `VdomLifecycle.mjs` still uses a `timeout` to handle updates on unmounted components. This can be refactored to use the new `mountedPromise`, creating a cleaner and more robust implementation.
-   **Complete Asymmetric Logic:** The `TreeBuilder` and `vdom.Helper` still need the final logic to handle the `neo-ignore` placeholder. This will enable truly asymmetric updates where non-participating component sub-trees are completely skipped during the diffing process.
-   **Performance Benchmarking:** Conduct rigorous performance tests to compare this branch against `dev` and ensure no regressions.
