---
id: 1369
title: 'draggable.DragProxyComponent: prevent the proxy el from cancelling mouseenter events'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-03T10:37:23Z'
updatedAt: '2020-11-03T10:37:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1369'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-03T10:37:51Z'
---
# draggable.DragProxyComponent: prevent the proxy el from cancelling mouseenter events

Torsten had the smart idea to use `pointer-events:none` on the drag proxy el, which is like hiding the node from the dom tree to get the "real" mouseenter events which we need for drop zones (dropzone: enter & leave).

## Timeline

- 2020-11-03T10:37:23Z @tobiu added the `enhancement` label
- 2020-11-03T10:37:24Z @tobiu assigned to @tobiu
- 2020-11-03T10:37:48Z @tobiu referenced in commit `3cbea64` - "draggable.DragProxyComponent: prevent the proxy el from cancelling mouseenter events #1369"
- 2020-11-03T10:37:51Z @tobiu closed this issue
- 2020-11-03T11:00:16Z @tobiu cross-referenced by #1370

