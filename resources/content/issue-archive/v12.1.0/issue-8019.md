---
id: 8019
title: 'Bug: isWindowDragging flag stuck after external drop'
state: CLOSED
labels:
  - bug
  - stale
  - ai
assignees:
  - tobiu
createdAt: '2025-12-04T01:30:21Z'
updatedAt: '2026-03-17T18:49:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8019'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-17T18:49:51Z'
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
### @github-actions - 2026-03-04T03:35:15Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-04T03:35:16Z @github-actions added the `stale` label
- 2026-03-17T09:42:25Z @saschabuehrle referenced in commit `4f14985` - "fix: reset isWindowDragging flag on drag end (fixes #8019)

The isWindowDragging flag was not being reset when drag operations ended
outside the main viewport, causing onWindowDisconnect to exit early and
preventing widget reintegration when popups were closed.

This fix adds an onDragEnd handler to the dashboard Container that explicitly
resets the #isWindowDragging flag whenever any drag operation completes,
ensuring proper cleanup regardless of where the drag ends."
- 2026-03-17T09:42:39Z @saschabuehrle cross-referenced by PR #9501
- 2026-03-17T18:49:52Z @tobiu closed this issue

