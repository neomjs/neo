---
id: 9528
title: 'Real-time cell resizing during grid column drag:move'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T13:20:54Z'
updatedAt: '2026-03-20T13:21:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9528'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

