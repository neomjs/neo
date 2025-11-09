---
id: 6974
title: Refactor `Neo.state.Provider` to use `core.Effect` based reactivity
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T11:30:39Z'
updatedAt: '2025-07-07T17:45:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6974'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-07T17:45:18Z'
---
# Refactor `Neo.state.Provider` to use `core.Effect` based reactivity

**Reported by:** @tobiu on 2025-07-07

**Description**

This feature refactors `Neo.state.Provider` to fully integrate the new `Neo.core.Effect` system and `Neo.state.HierarchicalDataProxy`. This replaces the previous custom, ad-hoc reactivity mechanism within `state.Provider`, leading to a more consistent, efficient, and maintainable data binding system.

**Motivation**

The existing `state.Provider` used a custom implementation for managing reactive data properties and their bindings to components. This approach had several drawbacks:

*   **Inconsistency:** It diverged from the `Neo.core.Config` reactivity model, creating two separate ways to handle reactive data within the framework.
*   **Complexity:** The manual dependency tracking and update propagation within `state.Provider` were complex and prone to subtle bugs, especially with nested and hierarchical data.
*   **Maintainability:** The custom reactivity logic made `state.Provider` harder to understand, debug, and extend.

This refactoring addresses these issues by leveraging the newly introduced `Effect` system and `HierarchicalDataProxy`.

**Implementation Details**

1.  **Internal Data Storage:** `state.Provider` now stores its data properties internally as `Neo.core.Config` instances, unifying its reactivity with the core framework. The `afterSetData` method has been updated to manage these `Config` instances.
2.  **Simplified Bindings:** The `createBinding()` method has been completely refactored. It now creates a `Neo.core.Effect` instance that wraps the component's binding formatter. This `Effect` automatically tracks dependencies via the `HierarchicalDataProxy` and updates the component's config when any of those dependencies change.
3.  **Hierarchical Data Access:** `getHierarchyData()` now returns the `HierarchicalDataProxy`, enabling seamless and reactive access to data across the provider hierarchy.
4.  **New Helper Methods:** `getDataConfig()`, `getOwnerOfDataProperty()`, and `hasNestedDataStartingWith()` have been added to `state.Provider` to support the `HierarchicalDataProxy`'s operation.
5.  **Cleanup:** Obsolete methods and manual binding management logic have been removed, including `createDataProperty()`, `onDataPropertyChange()`, `getFormatterVariables()`, and the old manual `bindings` map. This significantly reduces the complexity and size of `state.Provider`.
6.  **`setData()` Refactored:** The `setData()` and `internalSetData()` methods have been updated to interact directly with the `Neo.core.Config` instances.

**Benefits**

*   **Unified Reactivity:** Aligns `state.Provider`'s data binding with the core `Neo.core.Config` reactivity model, improving consistency across the framework.
*   **Increased Robustness:** The `Effect` system provides a more reliable and less error-prone mechanism for dependency tracking and change propagation.
*   **Improved Maintainability:** Simplifies `state.Provider`'s codebase, making it easier to understand, debug, and extend.
*   **Enhanced Performance:** The lightweight `Effect` class and optimized dependency tracking contribute to better overall performance.

**Future Considerations**

*   **Two-Way Binding:** The two-way binding mechanism needs to be re-evaluated and adapted to the new `Effect` system.
*   **Formulas:** The `formulas` config in `state.Provider` will need to be updated to leverage the new `Effect` system for its reactive computations.

## Comments

### @tobiu - 2025-07-07 17:45

<img width="816" height="718" alt="Image" src="https://github.com/user-attachments/assets/5b5472f9-e404-4fea-a79e-4f370956cd54" />

