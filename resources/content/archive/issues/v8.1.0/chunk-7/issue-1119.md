---
id: 1119
title: 'plugin.Resizable: import draggable.DragZone => resize logic'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2020-08-19T21:50:50Z'
updatedAt: '2024-09-27T02:34:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1119'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:23Z'
---
# plugin.Resizable: import draggable.DragZone => resize logic

we need to map the DragZone to the handles (neo-resizable).

register drag:start, move and end to the plugin owner.

onDragMove: either resize the real element or a dragProxy of it.
a proxyEl might be better for cancelling the operation (ESC).

## Timeline

- 2020-08-19T21:50:50Z @tobiu added the `enhancement` label
- 2020-08-19T21:50:51Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-13T02:31:11Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:11Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:23Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:24Z @github-actions closed this issue

