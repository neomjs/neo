---
id: 6973
title: state/createHierarchicalDataProxy.mjs
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T11:24:05Z'
updatedAt: '2025-07-07T11:25:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6973'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-07T11:25:06Z'
---
# state/createHierarchicalDataProxy.mjs

**Reported by:** @tobiu on 2025-07-07

**Description**

This feature introduces `Neo.state.createHierarchicalDataProxy`, a new `Proxy` class designed to provide reactive and hierarchical access to data managed by `Neo.state.Provider` instances. It acts as a crucial bridge, enabling the new `Neo.core.Effect` system to automatically track dependencies within the state provider's data hierarchy.

**Motivation**

The `Neo.state.Provider` system allows for nested and hierarchical data structures, where components can bind to data properties that might reside in their own provider or any parent provider. To integrate this complex data model with the new `Neo.core.Effect` system, a specialized mechanism is required that can:

*   Transparently resolve data properties across the provider hierarchy.
*   Intercept property access to dynamically register dependencies with the currently running `Effect`.
*   Maintain the performance and reactivity expected from the framework.

**Implementation Details**

1.  **`Neo.state.createHierarchicalDataProxy` (New funtion: `src/state/createHierarchicalDataProxy.mjs`):**
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

