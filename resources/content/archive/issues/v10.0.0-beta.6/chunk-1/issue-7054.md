---
id: 7054
title: 'Architectural Enhancement: Recursive VDOM Config Diffing for Nested Components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T17:26:47Z'
updatedAt: '2025-07-15T11:01:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7054'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T11:01:48Z'
---
# Architectural Enhancement: Recursive VDOM Config Diffing for Nested Components

## Summary

Evolve the VDOM config diffing mechanism in `Neo.functional.component.Base` to be recursive. This will enable deep, declarative updates for nested component configurations, allowing a parent's VDOM to precisely control the state of its grandchildren and beyond.

## Rationale & Problem with Current Approach

The current diffing implementation is "shallow". It can detect if a top-level config property like `store` or `columns` has changed. However, it cannot handle changes within nested configuration objects gracefully.

For example, consider this VDOM for a grid:
```javascript
{
    module: GridContainer,
    bodyConfig: {
        selectionModel: {
            singleSelect: true
        }
    }
}
```
If a parent re-renders and changes `singleSelect` to `false`, the current diffing logic sees that the `bodyConfig` object has changed and passes the entire new `bodyConfig` object to the grid's `set()` method. The grid would then likely destroy its existing `selectionModel` and create a new one, losing any selection state. This is not ideal.

## Proposed Solution: Instance-Aware Recursive Diffing

The architecture should be enhanced to "walk" the VDOM config and the component instance tree in parallel, applying targeted updates.

1.  **API Convention (Optional but Recommended):**
    -   Encourage component APIs where config keys map directly to instance property names. For example, instead of a generic `bodyConfig` bucket, the `GridContainer`'s API would be more direct:
        ```javascript
        {
            module: GridContainer,
            body: { // This key 'body' matches the 'this.body' instance property
                selectionModel: { /* ... */ }
            }
        }
        ```

2.  **Recursive Diffing Logic in `FunctionalBase`:**
    -   The `processVdomForComponents` diffing logic needs to be enhanced.
    -   When comparing a `newConfig` property to a `lastConfig` property, if the value is an object, don't stop there.
    -   **Check for a corresponding instance:** The logic should check if `instance[key]` (e.g., `grid.body`) is a component instance.
    -   **Recurse:** If it is, instead of flagging the whole `body` object as changed, the diffing logic should be called *recursively* on that sub-component. It would compare `newConfig.body` with `lastConfig.body` and generate a `deltaConfig` specifically for the `body` component.
    -   **Targeted `set()`:** This would result in a targeted update like `instance.body.set(deltaConfig)` instead of a disruptive `instance.set({body: newBodyObject})`.

## Benefits

-   **Truly Declarative:** A parent's VDOM can describe the entire state of its component subtree, no matter how deep.
-   **Precision and Performance:** The framework applies the absolute minimal set of changes, preventing unnecessary object destruction and re-creation.
-   **Improved Developer Experience:** Eliminates the need for developers to write imperative code (`myGrid.body.set(...)`) to manage the state of nested components. The VDOM becomes the single source of truth.

## Acceptance Criteria

-   Changing a deeply nested property in a functional component's VDOM (e.g., `grid.body.selectionModel.singleSelect = false`) results in a targeted `set()` call on the deepest affected component (`selectionModel.set({singleSelect: false})`) without re-instantiating its parents (`body` or `grid`).
-   The implementation is generic and can handle multiple levels of nesting.

## Timeline

- 2025-07-14T17:26:48Z @tobiu assigned to @tobiu
- 2025-07-14T17:26:49Z @tobiu added the `enhancement` label
- 2025-07-14T17:26:49Z @tobiu added parent issue #6992
- 2025-07-15T09:48:01Z @tobiu referenced in commit `514a988` - "#7054 grid.Container: use `body` instead of `bodyConfig`"
- 2025-07-15T10:26:51Z @tobiu referenced in commit `6da7594` - "#7054 grid.Container: use `headerToolbar` instead of `headerToolbarConfig`"
- 2025-07-15T11:01:35Z @tobiu referenced in commit `65bf8e7` - "Architectural Enhancement: Recursive VDOM Config Diffing for Nested Components #7054"
- 2025-07-15T11:01:48Z @tobiu closed this issue

