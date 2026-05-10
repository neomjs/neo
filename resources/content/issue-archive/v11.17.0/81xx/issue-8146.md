---
id: 8146
title: Enable ResizeObserver for Canvas and Blackboard auto-resize
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-19T16:33:18Z'
updatedAt: '2025-12-19T16:49:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8146'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T16:49:24Z'
---
# Enable ResizeObserver for Canvas and Blackboard auto-resize

Enable `ResizeObserver` support for `Neo.component.Canvas` to allow it to react to size changes automatically. 

Currently, `AgentOS.view.Blackboard` (which extends `Canvas`) fails to update its offscreen canvas size when the layout changes (e.g., due to drag-and-drop operations in `SortZone`).

Implementation plan:
1. Add `monitorSize_` config to `Neo.component.Canvas`.
2. Implement `onDomResize` in `Canvas` to fire a `resize` event.
3. Update `AgentOS.view.Blackboard` to enable `monitorSize` and listen for `resize` events to update the offscreen canvas dimensions.

## Timeline

- 2025-12-19T16:33:19Z @tobiu added the `enhancement` label
- 2025-12-19T16:33:19Z @tobiu added the `ai` label
- 2025-12-19T16:33:19Z @tobiu added the `core` label
- 2025-12-19T16:34:00Z @tobiu assigned to @tobiu
- 2025-12-19T16:47:38Z @tobiu referenced in commit `8582a71` - "Enable ResizeObserver for Canvas and Blackboard auto-resize #8146"
- 2025-12-19T16:49:11Z @tobiu referenced in commit `49eb04a` - "#8146 AgentOS.view.Blackboard: removed the monitorSize config (true is now the default value)"
- 2025-12-19T16:49:24Z @tobiu closed this issue

