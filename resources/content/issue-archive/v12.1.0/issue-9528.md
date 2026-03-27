---
id: 9528
title: 'Real-time cell resizing during grid column drag:move'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T13:20:54Z'
updatedAt: '2026-03-20T16:35:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9528'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 9529 Add lightweight cell resizing method to grid.Body'
blocking: []
closedAt: '2026-03-20T16:33:52Z'
---
# Real-time cell resizing during grid column drag:move

### Description
Currently, grid column resizing updates the header visually during `drag:move`, but the grid body cells only synchronize their widths upon `drag:end` (drop). To provide a more cohesive and native-feeling user experience, the grid body cells should dynamically resize in real-time as the header resize handle is dragged.

### Context
- The grid utilizes highly optimized virtualized rows (`src/grid/Body.mjs`, `src/grid/Row.mjs`).
- Modifying cell widths dynamically is achievable without massive performance penalties due to row and column buffering.
- Sorting columns via drag & drop already handles real-time visual updates, proving the architecture can support this (`src/draggable/grid/header/toolbar/SortZone.mjs`).

### Goal
- Enhance `src/grid/header/plugin/Resizable.mjs` to trigger a width synchronization to the grid body on `drag:move`.
- Ensure the synchronization method updates the `columnPositions` cache in the grid body and applies the necessary style deltas directly to the active VDOM nodes to prevent full re-renders on every pixel move.
- Potentially investigate whether throttling or debouncing the `drag:move` events is necessary to maintain smooth 60fps performance during complex resizing.

## Timeline

- 2026-03-20T13:20:55Z @tobiu added the `enhancement` label
- 2026-03-20T13:20:56Z @tobiu added the `ai` label
- 2026-03-20T13:20:56Z @tobiu added the `grid` label
- 2026-03-20T13:21:15Z @tobiu assigned to @tobiu
- 2026-03-20T16:21:49Z @tobiu cross-referenced by #9529
- 2026-03-20T16:23:11Z @tobiu marked this issue as being blocked by #9529
### @tobiu - 2026-03-20T16:33:33Z

**Input from Gemini 3.1 Pro:**

> ✦ The real-time cell resizing during grid column `drag:move` has been successfully implemented.
> 
> This was achieved by introducing a new, lightweight `updateCellPositions` method in `src/grid/Body.mjs` (handled in prerequisite ticket #9529) and hooking it into the `onDragMove` event of `src/grid/header/plugin/Resizable.mjs`.
> 
> By utilizing `updateDepth: 2` and directly mutating the VDOM and JS cache in memory, we bypass the expensive `createViewData()` row-render cycle, allowing the grid body cells to seamlessly and performantly match the header width in real-time. The final `drag:end` event remains untouched to ensure flex columns and viewport buffers are cleanly recalculated via `passSizeToBody()`.
> 
> Closing this ticket as completed.

- 2026-03-20T16:33:52Z @tobiu closed this issue
### @tobiu - 2026-03-20T16:35:00Z

Current state:

https://github.com/user-attachments/assets/e05539ee-97ee-4ccf-b56e-4f5d7b99facc


