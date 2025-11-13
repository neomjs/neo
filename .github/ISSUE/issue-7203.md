---
id: 7203
title: 'Phase 2: Live In-Page Proxy'
state: OPEN
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-20T22:05:23Z'
updatedAt: '2025-08-20T22:05:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7203'
author: tobiu
commentsCount: 0
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Phase 2: Live In-Page Proxy

The goal of this phase is to enhance the user experience by making the drag proxy a live, interactive component that continues to receive real-time updates during the drag operation. This is the foundational step for the dynamic windowing in Phase 3.

1.  **Override Drag Proxy Creation:**
    -   The `Container.SortZone` will override the `createDragProxy` method.

2.  **Implement Component Reparenting:**
    -   Instead of creating a static clone of the widget's VDOM for the proxy, the new logic will temporarily move the *actual component instance* into the `DragProxyComponent`.
    -   This will leverage the VDOM engine's capability to move live DOM nodes, ensuring the component within the proxy remains fully functional and continues to process data updates.

3.  **Finalize Drop Logic:**
    -   On drop, the live component will be moved from the proxy container back into its new position in the `Viewport`'s layout.

## Activity Log

- 2025-08-20 @tobiu assigned to @tobiu
- 2025-08-20 @tobiu added the `enhancement` label

