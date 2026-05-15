---
id: 8998
title: Fix Grid Cell Selection for Pooled Cells
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-05T09:55:02Z'
updatedAt: '2026-02-05T10:27:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8998'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T10:27:44Z'
---
# Fix Grid Cell Selection for Pooled Cells

The implementation of Hybrid Cell Pooling (#8992) broke cell-based selection models because `Neo.grid.Body#getCellId` returns transient "pooled" IDs (e.g., `...__cell-4`) instead of stable "logical" IDs (e.g., `...__firstname`). `CellModel` relies on stable IDs for state persistence and navigation.

Tasks:
1. Update `Neo.grid.Body#getCellId` to always return the logical ID (`rowId__dataField`).
2. Update `Neo.grid.Body#getDataField` to correctly resolve `dataField` from pooled cell IDs using `mountedColumns`.
3. Update `Neo.grid.Row#applyRendererOutput` to use the logical ID for selection state checks (`selectedCells.includes(logicalId)`), while preserving the pooled ID for the DOM attribute.

## Timeline

- 2026-02-05T09:55:03Z @tobiu added the `bug` label
- 2026-02-05T09:55:03Z @tobiu added the `ai` label
- 2026-02-05T09:55:03Z @tobiu added the `regression` label
- 2026-02-05T10:24:45Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-05T10:25:09Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the "JS errors on key nav" by updating `Neo.grid.Body#getDataField` to correctly handle pooled cell IDs.
> 
> **The Fix:**
> When a cell is pooled, its ID follows the format `...__cell-X`. The previous implementation of `getDataField` naively extracted `cell-X` as the dataField, causing `getCellId` (and subsequently `getColumn`) to crash when looking up this invalid field name during navigation logic.
> 
> The updated `getDataField` now:
> 1.  Detects pooled IDs (`__cell-`).
> 2.  Extracts the pool index.
> 3.  Iterates through the `mountedColumns` to find the matching column based on `columnIndex % cellPoolSize`.
> 4.  Returns the correct `dataField` (e.g., `lastname`) instead of `cell-X`.
> 
> This ensures that `CellModel` can correctly resolve the current selection context during keyboard navigation, eliminating the crash. I reverted all other attempted architectural changes to `getCellId` and `CellModel`, preserving the strict separation of concerns and the performance benefits of the pooling implementation.

- 2026-02-05T10:25:09Z @tobiu referenced in commit `b4435df` - "fix: Update GridBody.getDataField to resolve pooled cell IDs correctly (#8998)"
- 2026-02-05T10:27:44Z @tobiu closed this issue

