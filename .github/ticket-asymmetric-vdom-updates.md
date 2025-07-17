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

## Comparison with `dev` Branch

This feature branch contains significant foundational work not present in the `dev` branch. The changes lay the groundwork for the full refactoring while ensuring backward compatibility through extensive testing.

### Changes on this Branch (Not in `dev`)

-   **New Managers & Utilities:**
    -   `manager.VDomUpdate`: The new central orchestrator for update collisions has been created.
    -   `util.vdom.TreeBuilder`: The tree builder has been significantly refactored. It now correctly supports depth-based asymmetric expansion, which is a cornerstone of the new update strategy.
-   **New Test Suites:** Two comprehensive test suites (`VdomAsymmetricUpdates.mjs` and `VdomRealWorldUpdates.mjs`) exist on this branch to validate both the new and existing logic, providing a safety net for the refactoring.
-   **Framework Enhancements:** Core APIs like `Component.mountedPromise` and `VdomLifecycle.promiseUpdate` have been added or improved, enhancing the framework's capabilities for testing and asynchronous operations.
-   **Core Robustness & Refactoring:**
    -   **`VdomLifecycle.mjs`:** The mixin has been hardened to work reliably in both single-threaded (test) and multi-threaded (worker) environments by wrapping VDOM helper calls in `Promise.resolve()` and using safer access to `Neo.currentWorker`.
    -   **`main/DeltaUpdates.mjs`:** This module now dynamically imports the correct renderer (`DomApiRenderer` or `StringBasedRenderer`) based on the `useDomApiRenderer` config, making it more flexible and robust.
    -   **`core/Config.mjs`:** The internal subscription mechanism has been re-architected to be owner-ID-based, preventing subtle bugs when the same callback is registered with different scopes.
    -   **Markdown Processing:** The logic in `apps/portal/view/learn/ContentComponent.mjs` for handling code blocks has been refactored for better correctness and maintainability.

### Remaining Work to Complete the Epic

The `dev` branch still contains the original, distributed state management logic within `VdomLifecycle.mjs`. The following work remains to be done on this feature branch before it can be merged:

-   **Full Integration:** Refactor `VdomLifecycle.mjs` to completely remove its local caches and delegate all collision and merge logic to the new `VDomUpdate` manager.
-   **Finalize Asymmetric Logic:** Complete the implementation in `TreeBuilder` and `vdom.Helper` to handle the `neo-ignore` placeholder for truly asymmetric updates.
-   **Performance Benchmarking:** Conduct rigorous performance tests to compare this branch against `dev` and ensure no regressions.
