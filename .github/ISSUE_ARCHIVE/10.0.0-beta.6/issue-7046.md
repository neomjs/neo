---
id: 7046
title: Reactive Updates for Nested Components in Functional VDOM
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T13:48:19Z'
updatedAt: '2025-07-14T13:51:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7046'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-14T13:51:03Z'
---
# Reactive Updates for Nested Components in Functional VDOM

**Reported by:** @tobiu on 2025-07-14

---

**Parent Issue:** #6992 - Functional Components

---

## Summary

Enable child components (both classic and functional) declared within a parent functional component's `createVdom()` method to be reactively updated when their configuration changes in the parent's VDOM definition.

## Rationale

Currently, functional components can instantiate child components. However, to make the pattern truly powerful and declarative, the parent component needs a simple and efficient way to pass down new configurations to its children when its own state changes.

This feature allows a parent to drive the state of its children declaratively. When the parent's `createVdom()` effect re-runs, it can provide a new set of configs for a child. The framework should not destroy and recreate the child, but instead reuse the existing instance and apply the new configs.

## Technical Implementation

The implementation relies on enhancements to `Neo.functional.component.Base`.

1.  **Component Reconciliation:**
    - Inside `processVdomForComponents()`, when processing a VDOM node that represents a component (e.g., `{ module: MyComponent, id: 'my-child', text: 'new text' }`), the logic checks if a component with the same `id` already exists in its `childComponents` map.

2.  **Instance Reuse and Update:**
    - If a component instance *does* exist, it is reused.
    - The new configuration from the VDOM node is passed to the child component's `set()` method. This is the core of the reactive update.
    - The `set()` method efficiently batches all incoming config changes. It ensures that all `beforeSet` and `afterSet` hooks are called with the complete set of new values, and it triggers a single, final VDOM update on the child component only if one of the configs actually modified the VDOM.

3.  **VDOM Reference:**
    - After the initial instantiation, the parent functional component's VDOM tree is updated to hold only a lightweight reference to the child (e.g., `{ componentId: 'my-child' }`).
    - This decoupling is critical. It allows the parent and child components to manage and update their own VDOMs in complete isolation. A change in the child does not affect the parent's VDOM, and a re-render of the parent does not require a full re-render of the child, only a `set()` call if its configuration has changed.

## Benefits

-   **Declarative Composition:** Simplifies component composition by allowing parent components to manage child state via simple config objects in their VDOM.
-   **Performance:** Avoids costly destroy/recreate cycles by reusing component instances and applying batched updates.
-   **State Preservation:** Child component state (both internal `useConfig` state and public config state) is preserved across parent re-renders.
-   **Rendering Isolation:** Parent and child components can update their DOM representations independently, leading to more efficient and targeted DOM manipulations.

