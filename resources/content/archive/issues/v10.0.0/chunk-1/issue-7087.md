---
id: 7087
title: Introduce Functional Button Component
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-21T11:11:14Z'
updatedAt: '2025-07-21T11:17:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7087'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-21T11:17:24Z'
---
# Introduce Functional Button Component

## Summary

This ticket tracks the creation and integration of a new `Neo.functional.button.Base` component. This component will serve as a key UI element built using the functional component paradigm and will be a reference for future functional component development.

## Motivation

The framework is expanding to more robustly support functional components alongside its established class-based ones. A functional button is a fundamental building block for most applications. Adding it will enrich the framework's UI toolkit and provide a clear example of how to build functional components that correctly integrate with the reactive VDOM system.

This implementation leverages the framework's existing automatic VDOM node identifier system, which assigns stable and unique IDs to child nodes within the `createVdom` method. This allows for efficient and precise VDOM diffing without requiring manual ID management within the component's source, keeping the component logic clean and declarative.

## Scope

1.  **Create `Neo.functional.button.Base`**
    -   **Location**: `src/functional/button/Base.mjs`
    -   **Details**: A functional button that supports standard configs like `text`, `iconCls`, `handler`, `pressed`, and `badgeText`. Its VDOM is generated entirely within the `createVdom` method.

2.  **Create Test Suite**
    -   **Location**: `test/siesta/tests/functional/Button.mjs`
    -   **Details**: A Siesta test suite to verify the button's initial render and that VDOM deltas are correctly and precisely generated for its sub-nodes (e.g., icon, text) when its configs are changed.

3.  **Create Demo**
    -   **Location**: `examples/functional/button/`
    -   **Details**: A simple application to demonstrate the usage and features of the new functional button.

## Acceptance Criteria

-   The `Neo.functional.button.Base` class is implemented and added to the repository.
-   The Siesta test for the functional button passes, demonstrating correct initial rendering and precise delta updates.
-   The example application at `examples/functional/button` correctly displays and interacts with the functional button.
-   The implementation correctly relies on the framework's automatic VDOM node ID generation.

## Timeline

- 2025-07-21T11:11:14Z @tobiu assigned to @tobiu
- 2025-07-21T11:11:15Z @tobiu added the `enhancement` label
- 2025-07-21T11:16:25Z @tobiu referenced in commit `5d45b3b` - "Introduce Functional Button Component #7087"
- 2025-07-21T11:17:24Z @tobiu closed this issue

