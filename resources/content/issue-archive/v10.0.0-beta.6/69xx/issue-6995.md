---
id: 6995
title: Create Interoperability Layer
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-09T10:54:54Z'
updatedAt: '2025-07-15T19:44:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6995'
author: tobiu
commentsCount: 1
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T19:44:03Z'
---
# Create Interoperability Layer

### 1. Summary

Design and implement the mechanism that allows functional components to seamlessly host classic components (e.g., `Neo.grid.Container`) and vice-versa. This is critical for ensuring that developers can adopt the new functional paradigm without losing access to the existing library of powerful, classic components.

### 2. Rationale

A developer will inevitably need to mix and match component paradigms. For example, they might build the main structure of their application using new functional components but need to include a complex, data-driven component like the grid. Without a robust interoperability layer, this would be impossible, creating a fractured ecosystem.

The core challenge is that functional components define children declaratively as part of a VDOM tree, while classic components are instantiated via `Neo.create()` and managed within an `items` array. We need to bridge this gap.

### 3. Technical Challenges & Example

Consider a `FunctionalBase` component trying to render a classic grid:

```javascript
// Inside a FunctionalBase component...
createVdom() {
    return {
        tag: 'div',
        cn: [
            {tag: 'h1', text: 'My Classic Grid'},
            {
                // This is just a VDOM node, not an instance yet
                module: Neo.grid.Container,
                store: this.myStore,
                columns: [...]
            }
        ]
    };
}
```

To make this work, the system (likely the `VdomLifecycle` mixin) must solve these problems when it processes the VDOM from `createVdom()`:

1.  **Instantiation:** It must detect VDOM nodes that represent component definitions (e.g., via a `module` or `ntype` key) and automatically call `Neo.create()` to turn them into component instances. The logic inside `container.Base#createItem` is a good reference for this.
2.  **Parent/Child Linking:** Once the classic component instance (the grid) is created, its `parentId` must be set to the `id` of the functional component that is rendering it. The `parent` property should also be correctly linked.
3.  **Context Propagation:** This parent/child link is essential for context-aware features. The grid instance must be able to find its parent's controller or state provider via `getController()` and `getStateProvider()`.

### 4. Scope & Implementation Plan

-   Enhance the `VdomLifecycle` mixin (or create a new helper) to traverse VDOM trees before they are sent to the renderer.
-   This traversal logic will identify and instantiate component definitions.
-   It will be responsible for setting `parentId` on the new child instances.
-   Create test cases that verify a functional component can successfully render a classic `container.Base` and that the classic container can find its functional parent's controller.

### 5. Definition of Done

-   A functional component can successfully render a classic component defined within its `createVdom` method.
-   The classic component is correctly mounted in the DOM.
-   The classic component can access its functional parent via `this.parent`.
-   Context-aware features work across the boundary.

## Timeline

- 2025-07-09T10:54:55Z @tobiu added parent issue #6992
- 2025-07-09T10:54:55Z @tobiu added the `enhancement` label
- 2025-07-14T12:27:04Z @tobiu referenced in commit `93aa58e` - "#6995 examples.functional.hostComponent"
- 2025-07-14T12:39:20Z @tobiu referenced in commit `5fcc965` - "#6995 examples.functional.hostComponent.Component: removed an unused import, added the missing neo-config.json"
- 2025-07-14T12:49:31Z @tobiu referenced in commit `afc73cb` - "#6995 functional.component.Base: support for nesting cmps.WIP."
- 2025-07-14T12:54:09Z @tobiu referenced in commit `fd35f81` - "#6995 functional.component.Base: method order"
- 2025-07-14T13:16:30Z @tobiu referenced in commit `df0eba1` - "#6995 functional.component.Base: refactoring & cleanup"
### @tobiu - 2025-07-15T19:44:03Z

works fine now. see: https://github.com/neomjs/neo/blob/dev/apps/email/view/MainView.mjs

- 2025-07-15T19:44:04Z @tobiu closed this issue

