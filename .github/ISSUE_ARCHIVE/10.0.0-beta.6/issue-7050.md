---
id: 7050
title: 'Task: Enhance functional.component.Base with Core Configs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-14T14:54:26Z'
updatedAt: '2025-07-14T14:55:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7050'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-14T14:55:14Z'
---
# Task: Enhance functional.component.Base with Core Configs

**Reported by:** @tobiu on 2025-07-14

---

**Parent Issue:** #6992 - Functional Components

---

## Summary

Enhance `Neo.functional.component.Base` to include support for the `cls` and `windowId_` configurations, aligning it more closely with `Neo.component.Base` and enabling standard theming and multi-window support for functional components.

## Rationale

For functional components to be first-class citizens within the framework, they must support fundamental features like styling via CSS classes and proper behavior in multi-window environments.

-   **`cls`:** Allows developers to apply CSS classes directly to the root element of a functional component, enabling standard, stylesheet-based theming instead of relying on inline styles.
-   **`windowId_`:** Is essential for the framework's multi-window capabilities. It ensures that components are correctly associated with the browser window they belong to, which is critical for event handling, rendering, and resource management.

## Implementation Details

1.  **Add `cls` and `windowId_` to `config`:**
    -   Introduce `cls: null` and `windowId_: null` to the `static config` block of `FunctionalBase`.
    -   Ensure they are `reactive`.

2.  **Apply `cls` to VDOM:**
    -   In the `onEffectRunStateChange` method, after the `vdom` is created, merge the component's `cls` array with any classes already present on the root VDOM node using `Neo.util.Array.union()`.

3.  **Implement `afterSetWindowId`:**
    -   Add the `afterSetWindowId` lifecycle hook to handle changes to the `windowId_`. This is necessary for managing theme files and component state when it's moved between windows.

4.  **Temporary Properties for Mixin Compatibility:**
    -   Due to a limitation where mixins do not support public class fields, the following properties, which would normally come from a mixin, had to be added directly to `FunctionalBase` for now:
        -   `childUpdateCache = {}`
        -   `currentUpdateDepth = null`
        -   `resolveUpdateCache = []`
    -   **Note:** This is a temporary workaround. A future task should address the root cause of the mixin limitation.

## Acceptance Criteria

-   `cls` can be configured on a functional component and is applied to its root element.
-   `windowId_` can be configured and its `afterSet` hook is correctly triggered.
-   The new properties (`childUpdateCache`, etc.) are present on the class.
-   The changes are documented and this ticket is closed.

