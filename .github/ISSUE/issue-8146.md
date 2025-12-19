---
id: 8146
title: Enable ResizeObserver for Canvas and Blackboard auto-resize
state: OPEN
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-19T16:33:18Z'
updatedAt: '2025-12-19T16:34:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8146'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enable ResizeObserver for Canvas and Blackboard auto-resize

Enable `ResizeObserver` support for `Neo.component.Canvas` to allow it to react to size changes automatically. 

Currently, `AgentOS.view.Blackboard` (which extends `Canvas`) fails to update its offscreen canvas size when the layout changes (e.g., due to drag-and-drop operations in `SortZone`).

Implementation plan:
1. Add `monitorSize_` config to `Neo.component.Canvas`.
2. Implement `onDomResize` in `Canvas` to fire a `resize` event.
3. Update `AgentOS.view.Blackboard` to enable `monitorSize` and listen for `resize` events to update the offscreen canvas dimensions.

## Activity Log

- 2025-12-19 @tobiu added the `enhancement` label
- 2025-12-19 @tobiu added the `ai` label
- 2025-12-19 @tobiu added the `core` label
- 2025-12-19 @tobiu assigned to @tobiu

