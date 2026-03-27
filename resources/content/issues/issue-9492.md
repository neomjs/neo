---
id: 9492
title: 'Grid Multi-Body: Adapt Selection Models for Split Rows'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:21:54Z'
updatedAt: '2026-03-17T18:59:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9492'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Adapt Selection Models for Split Rows

Phase 6 of the Multi-Body Epic (#9486).

The current Grid Selection Models (RowModel, CellModel, etc.) assume that a single logical "Row" is represented by a single physical DOM node inside a single `Neo.grid.Body`.

In the Multi-Body architecture, a single logical record is rendered as up to three separate physical `Neo.grid.Row` instances (one in the `start` body, one in `center`, one in `end`).

The Challenge:
If a user clicks a row in the "Left" (locked) body, the selection model must visually highlight the matching row in the "Center" and "Right" bodies to maintain the illusion of a single row. 

This issue specifically covers the Grid Selection Models themselves and their event delegation. Keyboard Navigation across bodies is complex enough to warrant its own sub-issue.

Requirements:

1. **Multi-Node Selection updates in `BaseModel.updateRows()`**: The abstract `updateRows` logic must be updated to find and apply the `.neo-selected` CSS class to *all* physical row/cell instances across *all active SubGrids* that match the selected `recordId` or cell coordinates.
2. **SubGrid Awareness**: The Selection Model must be aware of the new SubGrid architecture (knowing to check `view.lockedStartBody`, `view.centerBody`, etc. instead of just a single `view`).
3. **Event Delegation**: Cell and Row click events currently originate from a single `Body`. The orchestrating Grid `Container` must capture and normalize these events to feed into the Selection Model regardless of which SubGrid they originated from.
4. **Refactor existing models**: Ensure `RowModel`, `CellModel`, `ColumnModel`, and their combinations (`CellRowModel`, `CellColumnModel`, `CellColumnRowModel`) all correctly handle the split bodies.

## Timeline

- 2026-03-16T18:21:56Z @tobiu added the `enhancement` label
- 2026-03-16T18:21:57Z @tobiu added the `ai` label
- 2026-03-16T18:21:57Z @tobiu added the `refactoring` label
- 2026-03-16T18:21:57Z @tobiu added the `grid` label
- 2026-03-16T18:22:10Z @tobiu added parent issue #9486
- 2026-03-16T21:51:51Z @tobiu changed title from **Grid Multi-Body: Adapt Selection Models & Keyboard Nav for Split Rows** to **Grid Multi-Body: Adapt Selection Models for Split Rows**
- 2026-03-17T18:59:16Z @tobiu assigned to @tobiu

