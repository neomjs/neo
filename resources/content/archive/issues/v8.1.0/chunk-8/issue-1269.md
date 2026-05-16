---
id: 1269
title: 'draggable.toolbar.SortZone: onDragStart() => ownerStyle'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-10-16T15:06:17Z'
updatedAt: '2020-10-16T15:06:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1269'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-16T15:06:48Z'
---
# draggable.toolbar.SortZone: onDragStart() => ownerStyle

the logic changed to remove the ownerRect from the itemRects to keep the indexes in oder.

however, the ownerStyle still gets mapped to the first itemRect, which is the first real item now.

## Timeline

- 2020-10-16T15:06:18Z @tobiu added the `bug` label
- 2020-10-16T15:06:18Z @tobiu assigned to @tobiu
- 2020-10-16T15:06:45Z @tobiu referenced in commit `1720f48` - "draggable.toolbar.SortZone: onDragStart() => ownerStyle #1269"
- 2020-10-16T15:06:48Z @tobiu closed this issue

