---
id: 1444
title: 'draggable.DragZone: createDragProxy() => initial drag proxy position'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-13T11:00:48Z'
updatedAt: '2020-11-13T11:01:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1444'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-13T11:01:49Z'
---
# draggable.DragZone: createDragProxy() => initial drag proxy position

in case moveHorizontal or moveVertical are set to false, the position needs to honor the dragElementRect rather than using 0px.

this resulted in a flickering when starting to drag.

## Timeline

- 2020-11-13T11:00:48Z @tobiu added the `enhancement` label
- 2020-11-13T11:00:48Z @tobiu assigned to @tobiu
- 2020-11-13T11:01:14Z @tobiu referenced in commit `eb3d113` - "draggable.DragZone: createDragProxy() => initial drag proxy position #1444"
- 2020-11-13T11:01:49Z @tobiu closed this issue

