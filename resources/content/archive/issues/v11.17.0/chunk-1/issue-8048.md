---
id: 8048
title: '[Dashboard] Pass dragProxyConfig to internal SortZone'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T13:15:49Z'
updatedAt: '2025-12-07T13:16:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8048'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T13:16:47Z'
---
# [Dashboard] Pass dragProxyConfig to internal SortZone

The `Neo.dashboard.Container` class instantiates a `SortZone` internally when `sortable` is true, but it fails to pass the `dragProxyConfig` from the dashboard instance to the sort zone.

This prevents developers from customizing the drag proxy behavior (e.g., switching to `DragProxyContainer` for live dragging) when using a Dashboard.

**Fix:**
Update `src/dashboard/Container.mjs` `afterSetSortable` method to pass `dragProxyConfig: me.dragProxyConfig` to the `SortZone` creation config.

## Timeline

- 2025-12-07T13:15:51Z @tobiu added the `bug` label
- 2025-12-07T13:15:51Z @tobiu added the `ai` label
- 2025-12-07T13:16:14Z @tobiu assigned to @tobiu
- 2025-12-07T13:16:43Z @tobiu referenced in commit `85bd328` - "[Dashboard] Pass dragProxyConfig to internal SortZone #8048"
- 2025-12-07T13:16:47Z @tobiu closed this issue

