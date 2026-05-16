---
id: 1279
title: 'draggable.toolbar.SortZone: support for vertical toolbars (drag&drop)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-20T13:44:46Z'
updatedAt: '2020-10-21T12:22:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1279'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-21T12:22:00Z'
---
# draggable.toolbar.SortZone: support for vertical toolbars (drag&drop)

onDragStart() needs to check the owner.layout config.

if this is a vbox layout, switch to the vertical mode.

## Timeline

- 2020-10-20T13:44:46Z @tobiu added the `enhancement` label
- 2020-10-20T13:44:47Z @tobiu assigned to @tobiu
- 2020-10-21T12:14:49Z @tobiu referenced in commit `8002bff` - "#1279 draggable.toolbar.SortZone: onDragMove() => support for vertical layouts"
- 2020-10-21T12:20:11Z @tobiu referenced in commit `3a4707c` - "#1279 draggable.toolbar.SortZone: switchItems() => support for vertical layouts"
- 2020-10-21T12:22:00Z @tobiu closed this issue
- 2020-10-21T12:37:04Z @tobiu referenced in commit `f3e92f5` - "#1279 draggable.toolbar.SortZone: switchItems() => code simplification"
- 2020-10-21T13:03:48Z @tobiu referenced in commit `e78f431` - "#1279 draggable.toolbar.SortZone: cleanup"

