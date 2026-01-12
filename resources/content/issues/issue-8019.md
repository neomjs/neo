---
id: 8019
title: 'Bug: isWindowDragging flag stuck after external drop'
state: OPEN
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-04T01:30:21Z'
updatedAt: '2025-12-04T01:30:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8019'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Bug: isWindowDragging flag stuck after external drop

When dragging a widget to create a popup, `#isWindowDragging` is set to true.
If the window is dropped outside the main viewport, this flag is not reset.
Consequently, closing the popup fails to restore the widget because `onWindowDisconnect` exits early when this flag is true.

**Proposed Fix:**
Investigate `Neo.draggable.container.SortZone` or `Neo.main.addon.DragDrop` events to detect the end of a window drag operation and explicitly reset `#isWindowDragging`.

**Context:**
The user mentioned `src/manager/Window.mjs` as a "god view" window manager that is partially implemented. This might be the architectural solution to manage window states centrally instead of ad-hoc flags in controllers.

## Timeline

- 2025-12-04T01:30:23Z @tobiu added the `bug` label
- 2025-12-04T01:30:23Z @tobiu added the `ai` label
- 2025-12-04T01:30:36Z @tobiu assigned to @tobiu
- 2025-12-04T01:30:57Z @tobiu added parent issue #7918

