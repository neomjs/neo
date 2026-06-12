---
id: 1547
title: 'dialog.Base: afterSetDraggable() => optionally add a drag:move dom listener'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-17T23:44:09Z'
updatedAt: '2021-03-17T23:56:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1547'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-17T23:56:45Z'
---
# dialog.Base: afterSetDraggable() => optionally add a drag:move dom listener

this is mostly relevant for the SharedWorkers context.

in case we pass `alwaysFireDragMove: true` inside the dragZone config, it would be nice to automatically add the dom listener and fire a custom event for it.

## Timeline

- 2021-03-17T23:44:09Z @tobiu added the `enhancement` label
- 2021-03-17T23:44:09Z @tobiu assigned to @tobiu
- 2021-03-17T23:56:34Z @tobiu referenced in commit `32164dc` - "dialog.Base: afterSetDraggable() => optionally add a drag:move dom listener #1547"
- 2021-03-17T23:56:45Z @tobiu closed this issue

