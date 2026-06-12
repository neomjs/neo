---
id: 6378
title: 'draggable.grid.header.toolbar.SortZone: add drag to scroll support'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-04T14:33:40Z'
updatedAt: '2025-02-05T23:47:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6378'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 6386 grid.View: createRow() => hide cells for a column, in case it is currently being dragged'
  - '[x] 6384 grid.View: columnPositions_ => use a collection instead of an array'
  - '[x] 6385 grid.View: createRow() => match columnPositions by dataField instead of index'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2025-02-05T23:47:40Z'
---
# draggable.grid.header.toolbar.SortZone: add drag to scroll support

When dragging a column header to the left or right edge of the container, the content needs to scroll.

## Timeline

- 2025-02-04T14:33:40Z @tobiu added the `enhancement` label
- 2025-02-04T14:33:41Z @tobiu assigned to @tobiu
- 2025-02-05T17:09:03Z @tobiu referenced in commit `479653b` - "#6378 main.addon.DragDrop: passing the boundaryContainerRect to the app worker, draggable.toolbar.SortZone: onDragMove() => added a first check if a drag OP leaves the boundary rect"
- 2025-02-05T21:38:28Z @tobiu referenced in commit `f6bf711` - "draggable.grid.header.toolbar.SortZone: add drag to scroll support #6378 WIP"
- 2025-02-05T21:52:55Z @tobiu added sub-issue #6386
- 2025-02-05T21:53:19Z @tobiu added sub-issue #6384
- 2025-02-05T21:53:39Z @tobiu added sub-issue #6385
- 2025-02-05T23:45:26Z @tobiu referenced in commit `8bf27c1` - "#6378 reducing the drag to scroll delay"
### @tobiu - 2025-02-05T23:47:40Z

https://github.com/user-attachments/assets/f3e0f93f-bd8e-4ee8-b432-a654fa90d4d4

- 2025-02-05T23:47:40Z @tobiu closed this issue

