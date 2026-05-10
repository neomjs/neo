---
id: 9531
title: 'Grid SortZone incorrectly intercepts column resize drag events, causing VDOM corruption and layout thrash'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T21:46:16Z'
updatedAt: '2026-03-20T21:48:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9531'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T21:48:43Z'
---
# Grid SortZone incorrectly intercepts column resize drag events, causing VDOM corruption and layout thrash

### Description
When resizing a grid column (using `grid.header.plugin.Resizable`), the `draggable.grid.header.toolbar.SortZone` was concurrently intercepting the same `drag:start`, `drag:move`, and `drag:end` events because both plugins listen to the same header button DOM nodes.

This caused the `SortZone` to execute its column-reordering logic during a resize operation. Specifically, `SortZone.onDragStart` would falsely identify a column as being dragged and set its `columnPosition.hidden = true` and `cell.style.visibility = 'hidden'`. This led to grid cells vanishing during resize. Furthermore, `SortZone.onDragEnd` would needlessly trigger `grid.body.createViewData(false, true)`, causing massive performance degradation by forcing a full, un-recycled VDOM regeneration of the entire grid body on every resize.

### Solution
1. **Mutex via Config:** Repurposed the `dragResortable` config on the header toolbar as a runtime semaphore.
2. **Resizable Plugin:** Modified `grid.header.plugin.Resizable` to set `toolbar.dragResortable = false` on `drag:start` and restore it to `true` on `drag:end`. Also optimized the toolbar lookup from `owner.up()` to `owner.parent`.
3. **SortZone Bailouts:** Added strict `if (!me.owner.dragResortable) return;` bailouts to the very top of `onDragStart`, `onDragMove`, and `onDragEnd` in `draggable.grid.header.toolbar.SortZone`. This cleanly severs the event processing if a resize is active.
4. **Cleanup:** Removed the now-obsolete `delete cell.style.visibility;` "self-healing" hack from `grid.Body#updateCellPositions` since the underlying VDOM corruption is prevented entirely.

## Timeline

- 2026-03-20T21:47:05Z @tobiu added the `bug` label
- 2026-03-20T21:47:05Z @tobiu added the `ai` label
- 2026-03-20T21:47:05Z @tobiu added the `grid` label
- 2026-03-20T21:47:38Z @tobiu referenced in commit `2ed06e8` - "fix: Prevent SortZone from intercepting column resize drag events (#9531)

- Disable SortZone during resize via dragResortable flag
- Add strict bailouts to SortZone lifecycle methods
- Remove obsolete self-healing hack in grid.Body"
- 2026-03-20T21:47:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-20T21:48:42Z

Fixed in 2ed06e864

- 2026-03-20T21:48:43Z @tobiu closed this issue
- 2026-03-20T21:52:07Z @tobiu referenced in commit `5a539f4` - "fix: Add timeout to dragResortable restoration to prevent trailing event race conditions (#9531)"

