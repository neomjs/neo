---
id: 9002
title: Fix Grid Row Cell Pooling Move Operations (Regression)
state: CLOSED
labels:
  - bug
  - regression
  - performance
assignees:
  - tobiu
createdAt: '2026-02-05T11:18:37Z'
updatedAt: '2026-02-05T11:47:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9002'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T11:47:23Z'
---
# Fix Grid Row Cell Pooling Move Operations (Regression)

We are observing a regression in `Neo.grid.Row` where horizontal scrolling triggers massive `moveNode` operations for pooled cells.

**Symptoms:**
- The VDOM engine reports hundreds of `moveNode` deltas during horizontal scrolling.
- This defeats the purpose of cell pooling (O(1) stability).

**Root Cause:**
Recent fixes for Cell Selection Models likely reintroduced dependency on visual order for DOM ID generation or structure, causing the VDOM diff engine to see "reordered" nodes instead of stable, attribute-updated nodes.

**Proposed Solution:**
1.  **Strict Separation:** Ensure DOM IDs for pooled cells are strictly index-based (`...__cell-0`, `...__cell-1`) and **never change order** in the `vdom.cn` array.
2.  **Dataset Identifier:** Use a `data-cell-id` attribute for the logical identifier needed by Selection Models, instead of relying on the DOM ID.
3.  **Refactor Selection Model:** Update `CellModel` to query by `data-cell-id` (or mapped logical ID) rather than DOM ID.

This prioritizes scrolling performance (Zero GC/Layout Thrashing) over Selection Model lookups.

## Timeline

- 2026-02-05T11:18:38Z @tobiu added the `bug` label
- 2026-02-05T11:18:38Z @tobiu added the `regression` label
- 2026-02-05T11:18:38Z @tobiu added the `performance` label
- 2026-02-05T11:19:26Z @tobiu assigned to @tobiu
- 2026-02-05T11:45:49Z @tobiu referenced in commit `7e7091f` - "fix: Implement Full Pool Rendering in Grid Row for zero structure deltas (#9002)"
### @tobiu - 2026-02-05T11:46:39Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Full Pool Rendering" strategy.
> 
> **Implementation Details:**
> 1.  **Stable VDOM Structure:** `Neo.grid.Row#createVdom` now renders the entire `cellPoolSize` range of pooled cells in every pass.
> 2.  **Placeholders:** If a pool index is not currently required by a mounted column, a placeholder cell (hidden) is rendered in that slot.
> 3.  **Logical IDs:** Added `ds: { cellId: ... }` to all cells to support Selection Models via dataset attributes instead of DOM IDs.
> 
> **Result:**
> Horizontal scrolling now generates **zero** `insertNode`, `removeNode`, or `moveNode` operations for the pooled cells. All updates are efficient attribute changes (`style`, `cls`, `innerHTML`), restoring the intended O(1) performance of the cell pooling feature.

- 2026-02-05T11:47:23Z @tobiu closed this issue

