---
id: 6328
title: 'grid.header.Toolbar: enhance the column drag&drop to be at the same level as tab headers'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-29T09:22:23Z'
updatedAt: '2025-01-29T14:32:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6328'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-29T14:32:47Z'
---
# grid.header.Toolbar: enhance the column drag&drop to be at the same level as tab headers

* We already have a visually stunning DD implementation for tab headers in place, it is time for the grid header toolbar to catch up
* We might be able to use `draggable.toolbar.SortZone`, but probably need to extend it

## Timeline

- 2025-01-29T09:22:23Z @tobiu added the `enhancement` label
- 2025-01-29T09:22:23Z @tobiu assigned to @tobiu
- 2025-01-29T09:23:12Z @tobiu referenced in commit `f88c17d` - "grid.header.Toolbar: enhance the column drag&drop to be at the same level as tab headers #6328 WIP"
- 2025-01-29T10:13:19Z @tobiu referenced in commit `87e9501` - "#6328 draggable.grid.header.toolbar.SortZone: base class"
- 2025-01-29T11:00:05Z @tobiu referenced in commit `2450a08` - "#6328 grid.header.Toolbar: using draggable.grid.header.toolbar.SortZone, scss file, drag start positioning"
- 2025-01-29T11:18:39Z @tobiu referenced in commit `1dcb110` - "#6328 draggable.grid.header.toolbar.SortZone: onDragStart() => honoring button height & width configs"
- 2025-01-29T11:22:48Z @tobiu referenced in commit `52b328b` - "#6328 draggable.grid.header.toolbar.SortZone: onDragEnd() => updating the grid.View content"
- 2025-01-29T11:28:27Z @tobiu referenced in commit `1da83d6` - "#6328 draggable.toolbar.SortZone: onDragEnd() => resetting margin & pointer-events"
- 2025-01-29T13:22:30Z @tobiu referenced in commit `e279184` - "#6328 draggable.grid.header.toolbar.SortZone: finished the core logic"
- 2025-01-29T13:32:32Z @tobiu referenced in commit `bb76436` - "#6328 draggable.grid.header.toolbar.SortZone: onDragEnd() => updating the aria-colindex button dom attributes"
- 2025-01-29T13:38:10Z @tobiu referenced in commit `8e911d4` - "#6328 draggable.grid.header.toolbar.SortZone: decreasing the opacity for non-dragged buttons while dragging"
- 2025-01-29T14:14:00Z @tobiu referenced in commit `5f644f0` - "#6328 draggable.grid.header.toolbar.SortZone: opacity based on theme vars"
- 2025-01-29T14:32:47Z @tobiu closed this issue

