---
id: 1246
title: 'draggable.DragZone: dragStart() => setBodyCls() => move to main thread'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-14T12:20:01Z'
updatedAt: '2020-10-14T12:23:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1246'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-14T12:23:21Z'
---
# draggable.DragZone: dragStart() => setBodyCls() => move to main thread

same for dragEnd(). setting the body to unselectable will always happen and should directly get applied inside the main thread addon.

## Timeline

- 2020-10-14T12:20:01Z @tobiu added the `enhancement` label
- 2020-10-14T12:20:01Z @tobiu assigned to @tobiu
- 2020-10-14T12:23:14Z @tobiu referenced in commit `b2230f4` - "draggable.DragZone: dragStart() => setBodyCls() => move to main thread #1246"
- 2020-10-14T12:23:21Z @tobiu closed this issue

