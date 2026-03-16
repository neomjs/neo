---
id: 9491
title: 'Grid Multi-Body: Overhaul Column Drag & Drop (SortZone) across Split Headers'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - grid
assignees: []
createdAt: '2026-03-16T18:21:28Z'
updatedAt: '2026-03-16T18:21:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9491'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Overhaul Column Drag & Drop (SortZone) across Split Headers

Phase 5 of the Multi-Body Epic (#9486).

The current `Neo.draggable.grid.header.toolbar.SortZone` assumes a single contiguous `Neo.grid.header.Toolbar` containing all columns. 

In the V2 Multi-Body architecture, the header is split into three independent toolbars (`start`, `center`, `end`). 

**The Challenge:**
When a user drags a column header from the `center` toolbar into the `start` toolbar (to lock it), the `SortZone` must support cross-container drag and drop. 

**Requirements:**
1. **Cross-Container DD:** The `SortZone` must be refactored to allow dragging items *between* the three sibling header toolbars.
2. **State Mutation:** Dropping a column into a different toolbar must automatically update the `locked` configuration of that column (e.g., dropping into the left toolbar sets `locked: 'start'`).
3. **Visual Indicators:** The proxy and drop indicators must seamlessly transition across the boundaries of the split header containers.

## Timeline

- 2026-03-16T18:21:29Z @tobiu added the `enhancement` label
- 2026-03-16T18:21:29Z @tobiu added the `ai` label
- 2026-03-16T18:21:29Z @tobiu added the `refactoring` label
- 2026-03-16T18:21:30Z @tobiu added the `grid` label
- 2026-03-16T18:21:43Z @tobiu added parent issue #9486

