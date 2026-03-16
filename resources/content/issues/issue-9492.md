---
id: 9492
title: 'Grid Multi-Body: Adapt Selection Models & Keyboard Nav for Split Rows'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - grid
assignees: []
createdAt: '2026-03-16T18:21:54Z'
updatedAt: '2026-03-16T18:21:54Z'
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
# Grid Multi-Body: Adapt Selection Models & Keyboard Nav for Split Rows

Phase 6 of the Multi-Body Epic (#9486).

The current `Neo.selection.grid.RowModel` and `CellModel` assume that a single logical "Row" is represented by a single physical DOM node inside a single `Neo.grid.Body`.

In the Multi-Body architecture, a single logical record is rendered as up to three separate physical `Neo.grid.Row` instances (one in the `start` body, one in `center`, one in `end`).

**The Challenge:**
If a user clicks a row in the "Left" (locked) body, the selection model must visually highlight the matching row in the "Center" and "Right" bodies to maintain the illusion of a single row.

**Requirements:**
1. **Multi-Node Selection:** The Selection Models must be updated to find and apply the `.neo-selected` CSS class to *all* physical row instances across active SubGrids that match the selected `recordId`.
2. **Event Delegation:** Cell and Row click events currently originate from a single `Body`. The orchestrating `Container` must capture and normalize these events regardless of which SubGrid they originated from.
3. **Keyboard Navigation:** Using Up/Down/Left/Right arrows must seamlessly cross the physical boundaries between the SubGrids (e.g., navigating Right from the last cell in the `start` body moves focus into the first cell of the `center` body).

## Timeline

- 2026-03-16T18:21:56Z @tobiu added the `enhancement` label
- 2026-03-16T18:21:57Z @tobiu added the `ai` label
- 2026-03-16T18:21:57Z @tobiu added the `refactoring` label
- 2026-03-16T18:21:57Z @tobiu added the `grid` label
- 2026-03-16T18:22:10Z @tobiu added parent issue #9486

