---
id: 6381
title: 'draggable.grid.header.toolbar.SortZone: limit the boundary rect to match the grid container width'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-05T12:48:43Z'
updatedAt: '2025-02-05T16:12:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6381'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-05T16:12:22Z'
---
# draggable.grid.header.toolbar.SortZone: limit the boundary rect to match the grid container width

* We must not drag outside of the visible area
* The boundary container rect needs the height of `header.Toolbar`
* The boundary container rect needs the width of `grid.Container`

It might make sense to enhance `boundaryContainerId` to also accept `String[]` => multiple ids and create an intersection rectangle.

## Timeline

- 2025-02-05T12:48:43Z @tobiu added the `enhancement` label
- 2025-02-05T12:48:43Z @tobiu assigned to @tobiu
- 2025-02-05T16:10:49Z @tobiu referenced in commit `c9e8a38` - "draggable.grid.header.toolbar.SortZone: limit the boundary rect to match the grid container width #6381"
### @tobiu - 2025-02-05T16:12:22Z

https://github.com/user-attachments/assets/d02c56be-ec7a-409e-9112-de1240d37fbd

- 2025-02-05T16:12:23Z @tobiu closed this issue

