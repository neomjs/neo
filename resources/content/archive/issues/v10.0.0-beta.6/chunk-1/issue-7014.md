---
id: 7014
title: Enhance `Neo.functional.component.Base` for Hook Support
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-11T10:23:24Z'
updatedAt: '2025-07-11T10:24:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7014'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-11T10:24:43Z'
---
# Enhance `Neo.functional.component.Base` for Hook Support

## 1. Summary

This ticket covers the foundational work on `Neo.functional.component.Base` to enable the hook system (`useConfig`, `useEvent`, etc.) for beginner-mode functional components. The key challenge was to allow external hook functions to manage state on a component instance without exposing that state through the public API.

## 2. Rationale

The initial implementation of `functional.component.Base` was a minimal class with a `createVdom` method driven by an `Effect`. To support hooks like React's `useState`, we needed a mechanism to:
1.  Associate state (like `Config` instances) with a specific component instance.
2.  Track the order of hook calls within a single `createVdom` execution.
3.  Provide a way for external hook functions to access this internal state securely.

Using protected properties (e.g., `_hooks`) was considered but deemed insufficient for true encapsulation. The chosen solution provides a robust, framework-private way to manage hook state.

## 3. Scope & Implementation Plan

1.  **Introduce Symbols for State:**
    *   Create two `Symbol.for()` symbols: `hookIndexSymbol` and `hooksSymbol`.
    *   These symbols act as unique keys for properties on the component instance, making them accessible to any module that knows the symbol, but keeping them off the public API.

2.  **Initialize State in `FunctionalBase`:**
    *   In the `construct()` method of `functional.component.Base`, use `Object.defineProperties` to add the symbol-keyed properties (`[hookIndexSymbol]` and `[hooksSymbol]`) to the component instance.
    *   These properties are configured to be non-enumerable (`enumerable: false`) to further hide them from standard object iteration.
    *   The `hookIndex` is reset to `0` at the beginning of every `vdomEffect` execution, ensuring a clean slate for each render.

3.  **Component Registration:**
    *   Implement the `afterSetId()` and `destroy()` methods to correctly register and unregister the functional component instance with `Neo.manager.Component`. This makes functional components discoverable via `Neo.getComponent()`, integrating them fully into the framework's component model.

4.  **Link Effect to Component:**
    *   Modify the `vdomEffect` creation to pass the component's ID (`this.id`) to the `Effect` constructor. This allows the `useConfig` hook to retrieve the currently rendering component instance by getting the active effect from `EffectManager` and looking up the component by its ID.

## 4. Definition of Done

-   `functional.component.Base` is updated to use `Symbol.for()` to manage internal hook state.
-   The component correctly registers and unregisters itself with `ComponentManager`.
-   The `vdomEffect` is correctly associated with the component's ID.
-   The implementation provides the necessary foundation for the `useConfig` hook to function correctly.

## Timeline

- 2025-07-11T10:23:24Z @tobiu assigned to @tobiu
- 2025-07-11T10:23:25Z @tobiu added parent issue #6992
- 2025-07-11T10:23:26Z @tobiu added the `enhancement` label
- 2025-07-11T10:24:32Z @tobiu referenced in commit `64c7b27` - "Enhance Neo.functional.component.Base for Hook Support #7014"
- 2025-07-11T10:24:43Z @tobiu closed this issue

