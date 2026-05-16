---
id: 6965
title: 'Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T18:41:11Z'
updatedAt: '2025-10-22T22:56:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6965'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T19:11:34Z'
---
# Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access

Exploration quest inside the `effect-based-state-provider` feature branch

**Description**

This feature introduces `Neo.state.HierarchicalDataProxy`, a new `Proxy` class designed to provide reactive and hierarchical access to data managed by `Neo.state.Provider` instances. It acts as a crucial bridge, enabling the new `Neo.core.Effect` system to automatically track dependencies within the state provider's data hierarchy.

**Motivation**

The `Neo.state.Provider` system allows for nested and hierarchical data structures, where components can bind to data properties that might reside in their own provider or any parent provider. To integrate this complex data model with the new `Neo.core.Effect` system, a specialized mechanism is required that can:

*   Transparently resolve data properties across the provider hierarchy.
*   Intercept property access to dynamically register dependencies with the currently running `Effect`.
*   Maintain the performance and reactivity expected from the framework.

**Implementation Details**

1.  **`Neo.state.HierarchicalDataProxy` (New Class: `src/state/HierarchicalDataProxy.mjs`):**
    *   A `Proxy` that wraps the conceptual merged data of a `state.Provider` and its ancestors.
    *   Its `get` trap is the core of its functionality:
        *   When a property is accessed (e.g., `data.user.firstname`), it dynamically searches up the `state.Provider` hierarchy to find the `state.Provider` instance that "owns" that specific data property.
        *   It then retrieves the corresponding `Neo.core.Config` instance for that data property from the owning provider.
        *   Crucially, if an `Neo.core.Effect` is currently running (as determined by `Neo.core.EffectManager`), the `HierarchicalDataProxy` registers this `Neo.core.Config` instance as a dependency for that `Effect`.
        *   It returns the `value` from the `Neo.core.Config` instance.
    *   Supports nested property access by returning new `HierarchicalDataProxy` instances for intermediate paths (e.g., accessing `data.user` returns a proxy for the `user` object, which then allows access to `data.user.firstname`).

**Benefits**

*   **Seamless Integration:** Provides a transparent way to access hierarchical state provider data within reactive computations.
*   **Automatic Dependency Tracking:** Eliminates the need for manual dependency declaration, simplifying binding logic and reducing potential errors.
*   **Performance:** Optimized to efficiently traverse the provider hierarchy and interact with `Neo.core.Config` instances.
*   **Foundation for Refactoring:** Lays the essential groundwork for refactoring `Neo.state.Provider` to fully utilize the new `Effect` system.

## Timeline

- 2025-07-06T18:41:11Z @tobiu assigned to @tobiu
- 2025-07-06T18:41:12Z @tobiu added the `enhancement` label
- 2025-07-06T19:09:37Z @tobiu changed title from **Feature: Implement Neo.state.HierarchicalDataProxy for reactive state provider data access** to **Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access**
- 2025-07-06T19:10:42Z @tobiu referenced in commit `96a0173` - "Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access #6965"
- 2025-07-06T19:11:34Z @tobiu closed this issue
- 2025-07-06T19:48:05Z @tobiu referenced in commit `ac4810a` - "Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access #6965"
- 2025-07-06T19:49:06Z @tobiu cross-referenced by #6966
- 2025-07-09T00:10:49Z @tobiu referenced in commit `4720f89` - "Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access #6965"
- 2025-07-09T00:10:49Z @tobiu referenced in commit `eff9df6` - "Feature: Implement Neo.state.createHierarchicalDataProxy for reactive state provider data access #6965"

