---
id: 8054
title: '[Draggable] Investigate sorting corruption after multiple live drag operations'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T19:11:13Z'
updatedAt: '2025-12-11T02:18:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8054'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T02:18:04Z'
---
# [Draggable] Investigate sorting corruption after multiple live drag operations

While the "Manual DOM Delta" strategy for live dragging works correctly for the first drag operation, subsequent drag operations result in incorrect item ordering in the UI, despite `moveTo` seemingly receiving correct indices.

**Observed Behavior:**
1.  Initial: `[A(0), B(1), C(2)]`
2.  Op 1: Drag C to 1. `moveTo(2, 1)`. Result: `[A, C, B]`. (Correct).
3.  Op 2: Drag A to 1. `moveTo(0, 1)`. Result: `[A, B, C]`. (Incorrect - seems to revert/scramble).

**Potential Causes:**
1.  **DOM vs VDOM Sync:** The manual DOM manipulations (move/restore) might be leaving the DOM in a state that VDOM reconciliation misinterprets during the next update.
2.  **SortZone State:** `SortZone` logic relies on `itemRects`. If `getDomRect` returns rects reflecting a stale or unexpected DOM order, the sorting logic degrades.
3.  **Container Indexing:** The `moveTo` logic relies on `owner.items` order. We need to verify if `owner.items` is actually persisting the order change from Op 1 correctly.

**Task:**
Investigate the state of `owner.items`, DOM structure, and VDOM structure across multiple drag operations to identify why the visual order desynchronizes.

## Timeline

- 2025-12-07T19:11:14Z @tobiu added the `bug` label
- 2025-12-07T19:11:14Z @tobiu added the `ai` label
- 2025-12-07T19:11:35Z @tobiu assigned to @tobiu
- 2025-12-11T02:17:09Z @tobiu referenced in commit `2d5e3c9` - "[Draggable] Investigate sorting corruption after multiple live drag operations #8054"
### @tobiu - 2025-12-11T02:17:54Z

**Input from Gemini 2.5 pro:**

> ✦ I have identified and fixed the root cause of the sorting corruption.
> 
> **Root Cause:**
> The `Neo.draggable.dashboard.SortZone` class contained a `moveTo` override that was performing redundant and incorrect index re-mapping.
> - The base `SortZone` class already calculates `fromIndex` and `toIndex` relative to the `owner.items` array.
> - The `DashboardSortZone` override incorrectly treated these indices as relative to `sortableItems` and attempted to map them back to `owner.items` a second time.
> - This logic critically failed when the `dragPlaceholder` was involved (which is not in `owner.items`), resulting in indices resolving to `-1`. `Neo.util.Array.move(-1, ...)` then moves the *last* item in the array, causing the scrambled sorting behavior.
> 
> **The Fix:**
> I have removed the faulty `moveTo` method from `src/draggable/dashboard/SortZone.mjs`. The class now correctly inherits the base implementation from `SortZone`, which:
> 1. Correctly identifies the `fromIndex` using the `dragComponent` reference (bypassing the placeholder issue).
> 2. Correctly identifies the `toIndex` using the target sortable item.
> 3. Calls `owner.moveTo()` with the correct, 0-based indices for the full items array.
> 
> **Verification:**
> I verified this fix with a simulation script covering:
> 1. Standard sorting operations.
> 2. Complex "mixed content" scenarios (e.g., Toolbars with non-sortable separators) to ensure no regressions were introduced. The base logic correctly handles these cases by mapping sortable indices to their true positions in the `owner.items` array.

- 2025-12-11T02:18:04Z @tobiu closed this issue
- 2025-12-11T02:29:49Z @tobiu cross-referenced by #8086

