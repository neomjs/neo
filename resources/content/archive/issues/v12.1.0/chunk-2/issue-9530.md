---
id: 9530
title: Grid cells vanish during column resize after a drag-and-drop column reorder
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T20:07:30Z'
updatedAt: '2026-03-20T20:18:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9530'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T20:16:20Z'
---
# Grid cells vanish during column resize after a drag-and-drop column reorder

### Description
We encountered a glitch where grid cells can vanish during a column resize operation if the grid columns were previously reordered via drag-and-drop. This occurs regardless of how much time passes between the reorder and the resize.

### Reproduction
1. Enable `SortZone` (drag-and-drop reordering) and `Resizable` on a grid.
2. Drag and drop column A to a new position.
3. Grab the resize handle of another column and drag to resize it.
4. The cells of column A will vanish from the grid body during the `drag:move` cycle, but reappear when the drag ends.

### Root Cause Analysis
During a drag-and-drop column reorder (`SortZone.onDragStart`), the cells of the dragged column are explicitly hidden (`cell.style.visibility = 'hidden'`). While the cells correctly reappear in the DOM upon drop, the VDOM state somehow retains or inherits this hidden visibility state in the App Worker. When a subsequent `drag:move` resize operation triggers `updateCellPositions` (which performs a shallow `updateDepth: 2` sync to the VDOM), the VDOM worker blindly reapplies the stale `visibility: 'hidden'` state to the previously reordered column.

### Solution
Implement a self-healing safety net inside `updateCellPositions` in `src/grid/Body.mjs`. If it encounters a cell with `style.visibility === 'hidden'`, it explicitly deletes the visibility property before generating the shallow update delta. Additionally, the `updateCellPositions` loop was optimized to rely on linear array order rather than spatial math, making the calculation more robust.

## Timeline

- 2026-03-20T20:07:31Z @tobiu added the `bug` label
- 2026-03-20T20:07:31Z @tobiu added the `ai` label
- 2026-03-20T20:07:32Z @tobiu added the `grid` label
- 2026-03-20T20:14:49Z @tobiu changed title from **Grid cells vanish during rapid resize after column sort** to **Grid cells vanish during column resize after a drag-and-drop column reorder**
- 2026-03-20T20:15:30Z @tobiu referenced in commit `458f91c` - "fix: Prevent grid cells vanishing during column resize after drag-and-drop reorder (#9530)"
- 2026-03-20T20:15:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-20T20:15:53Z

**Input from Gemini 3.1 Pro:**

> ✦ The `updateCellPositions` method in `src/grid/Body.mjs` was refactored to:
> 1. Eliminate spatial (`pos.x > minX`) logic and instead rely on robust, single-pass iteration using the `columnPositions` array order, making it immune to absolute viewport coordinate pollution.
> 2. Introduce a self-healing block that explicitly deletes `style.visibility` before applying the delta, ensuring that stale `visibility: 'hidden'` state left behind by the asynchronous 20ms timeout queue is safely cleared during the `drag:move` tick.
> 
> The update has been pushed to the `dev` branch. Closing this ticket.

- 2026-03-20T20:16:21Z @tobiu closed this issue

