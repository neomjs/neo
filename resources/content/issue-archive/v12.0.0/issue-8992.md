---
id: 8992
title: Implement Hybrid Cell Buffering (Pooling) for Grid Rows
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-04T21:13:49Z'
updatedAt: '2026-02-04T22:49:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8992'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T22:49:41Z'
---
# Implement Hybrid Cell Buffering (Pooling) for Grid Rows

## Problem
The current `Neo.grid.Row` implementation generates cell IDs based on the column `dataField`. During horizontal scrolling, this causes DOM nodes to be destroyed and created as they enter/exit the viewport.

This constant allocation/deallocation creates memory pressure (GC pauses) during rapid scrolling.

## Solution: Hybrid Cell Pooling
Implement a pooling strategy to reuse cell containers.

### 1. Pooled Cells (Recycled)
*   **Target:** Columns with `hideMode: 'removeDom'`.
*   **Mechanism:** Fixed pool of cell containers (IDs: `...__cell-0`, `...__cell-1`).
*   **Behavior:** Recycle cells by updating `style.left`, `cls`, and content.
*   **Impact on Child Nodes:**
    *   **Text/Homogeneous Content:** If the new column has the same structure (e.g. plain text or same HTML structure), the inner nodes are also reused/updated. **Zero GC.**
    *   **Heterogeneous Content:** If the new column has a different structure, the inner nodes will be swapped by the VDOM engine. We still save the allocation of the heavy Cell Container (`div.neo-grid-cell`) and its layout positioning.

### 2. Permanent Cells (Stateful)
*   **Target:** Columns with `hideMode: 'visibility'` (e.g., Sparklines).
*   **Mechanism:** Keep data-bound IDs (`...__firstname`).
*   **Behavior:** Persist in DOM; toggle visibility.

## Implementation Details
*   **`Neo.grid.Body`**: Implement `getCellId(rowIndex, dataField)` to handle pooled/permanent lookups.
*   **`Neo.grid.Row`**: Refactor `createVdom` for the hybrid pass.

## Goal
Eliminate GC-induced micro-stutters by ensuring O(1) stability for the Grid Structure (Cell Containers).

## Timeline

- 2026-02-04T21:13:50Z @tobiu added the `enhancement` label
- 2026-02-04T21:13:50Z @tobiu added the `ai` label
- 2026-02-04T21:13:50Z @tobiu added the `performance` label
- 2026-02-04T22:41:32Z @tobiu referenced in commit `644fee5` - "feat: Implement hybrid cell pooling for Grid Rows (#8992)"
### @tobiu - 2026-02-04T22:42:02Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the **Hybrid Cell Pooling** strategy and pushed the changes to the `feat/grid-cell-pooling` branch.
> 
> **Implementation Highlights:**
> 1.  **Dynamic Pool Sizing:** `Neo.grid.Body` now auto-scales the cell pool based on the visible column range, preventing ID collisions.
> 2.  **Stable VDOM Structure:** `Neo.grid.Row` renders the **full cell pool** (active cells + hidden placeholders) in a strict index-based order. This guarantees O(1) DOM stability with **zero** `insertNode`, `removeNode`, or `moveNode` operations during scrolling, as confirmed by the latest delta logs.
> 3.  **Plain Object Safety:** Added robust fallback logic in `Row.applyRendererOutput` to support lazy-loaded (plain object) records correctly.
> 4.  **Hybrid Mode:** Permanent cells (e.g. Sparklines) are preserved outside the pool to maintain their state/context.
> 
> **Verification:**
> The latest logs confirm that horizontal scrolling now generates purely attribute updates (`innerHTML`, `style`, `cls`), achieving the performance goal.
> 
> **Branch:** `feat/grid-cell-pooling`
> **Next Steps:** Review and merge the PR.

- 2026-02-04T22:44:42Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-04T22:45:31Z

**Input from Gemini 3 Pro:**

> ✦ I have verified the performance gains with real-world scrolling data from the Big Data Grid example (50 rows, 10 columns visible).
> 
> **Performance Analysis:**
> - **Scroll Operation:** Full horizontal scroll (Left to Right).
> - **Total Frames:** 12 frames.
> - **Total Deltas:** ~3250 attribute updates.
> - **Operations:** Strictly `updateNode` (innerHTML, style). **Zero** `insertNode` or `moveNode` operations were observed during the scroll phase.
> 
> This confirms that the **Stable VDOM Sorting** strategy successfully eliminated the massive layout thrashing caused by node rotation, and the **Cell Pooling** strategy successfully eliminated the GC overhead of node destruction. The result is a highly efficient, O(1) virtual scrolling implementation.
> 
> **Task Complete.** Closing ticket.

- 2026-02-04T22:49:42Z @tobiu closed this issue

