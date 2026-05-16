---
id: 1270
title: 'draggable.toolbar.SortZone: onDragStart() => create the proxy before changing the dom'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-17T11:46:13Z'
updatedAt: '2020-10-17T11:46:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1270'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-17T11:46:38Z'
---
# draggable.toolbar.SortZone: onDragStart() => create the proxy before changing the dom

when dragging multiple items one after another, i noticed some mis-matches calculating the offsetX value.

it looks like we get sometimes wrong positions, in case the toolbar dom is getting changed.

better trigger dragStart() earlier.

## Timeline

- 2020-10-17T11:46:13Z @tobiu added the `enhancement` label
- 2020-10-17T11:46:13Z @tobiu assigned to @tobiu
- 2020-10-17T11:46:31Z @tobiu referenced in commit `bf9e2d7` - "draggable.toolbar.SortZone: onDragStart() => create the proxy before changing the dom #1270"
- 2020-10-17T11:46:38Z @tobiu closed this issue

