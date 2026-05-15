---
id: 7053
title: 'Architectural Enhancement: Implement VDOM Config Diffing in FunctionalBase'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T16:36:36Z'
updatedAt: '2025-07-14T17:14:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7053'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-14T17:14:38Z'
---
# Architectural Enhancement: Implement VDOM Config Diffing in FunctionalBase

## Summary

Implement a VDOM configuration diffing mechanism within `Neo.functional.component.Base` to prevent the unnecessary re-creation of stateful objects (like stores and columns) in child components on every parent render cycle.

## Rationale

Currently, when a functional component re-renders, it passes a new configuration object to its classic child components. Even if the configuration values are conceptually the same (e.g., `store: MyStore`), the child component's `set()` method receives a new object/class reference and re-initializes its internal state, leading to a complete loss of data (e.g., grid selections, loaded records).

This forces developers into non-declarative workarounds, like creating module-level singletons.

The correct solution is to make the framework smarter. `FunctionalBase` should compare the new VDOM config with the last applied config and only call `set()` on the child with the properties that have *actually changed*. This preserves the declarative nature of the VDOM while ensuring state is not lost.

## Implementation Plan

1.  **Update `childComponents` Map Structure:**
    -   The `childComponents` map will be changed from `Map<string, Component>` to `Map<string, {instance: Component, lastConfig: Object}>`. This will store the child instance alongside the last configuration object applied to it.

2.  **Enhance `processVdomForComponents`:**
    -   **Reconciliation:** When an existing child is found via its `id`, retrieve the wrapper object: `const childData = me.childComponents.get(componentKey);`.
    -   **Delta Calculation:**
        -   Create the `newConfig` object from the current `vdomTree` (excluding `id`, `module`, etc.).
        -   Retrieve `childData.lastConfig`.
        -   Perform a deep comparison (`Neo.isEqual()`) between `newConfig` and `lastConfig` to generate a `deltaConfig` containing only the changed properties.
    -   **Apply Delta:** If the `deltaConfig` object is not empty, call `childData.instance.set(deltaConfig)`. If it is empty, do nothing.
    -   **Update Cache:** When moving the component to the `#newChildComponents` map, store the updated wrapper object: `me.#newChildComponents.set(componentKey, {instance: childData.instance, lastConfig: newConfig});`.

3.  **Update Component Creation:**
    -   When a new component is created, it will be stored in the `#newChildComponents` map with the new wrapper structure: `me.#newChildComponents.set(componentKey, {instance: newComponent, lastConfig: newConfig});`.

4.  **Update `destroy()` Method:**
    -   The `destroy` method must be updated to iterate over the map's values and call `childData.instance.destroy()`.

## Acceptance Criteria

-   The `childComponents` map in `FunctionalBase` stores objects with `instance` and `lastConfig` properties.
-   `set()` is only called on child components if their VDOM config has demonstrably changed.
-   The Email App's grid component, configured declaratively with `store: EmailsStore`, no longer re-creates its store on parent re-renders.
-   The state of the grid (selection, scroll position) is preserved across parent state changes that do not affect the grid's own configuration.

## Timeline

- 2025-07-14T16:36:36Z @tobiu assigned to @tobiu
- 2025-07-14T16:36:37Z @tobiu added the `enhancement` label
- 2025-07-14T16:36:37Z @tobiu added parent issue #6992
- 2025-07-14T16:54:29Z @tobiu referenced in commit `db706b1` - "Architectural Enhancement: Implement VDOM Config Diffing in FunctionalBase #7053"
- 2025-07-14T17:14:38Z @tobiu closed this issue

