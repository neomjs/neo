---
id: 8054
title: '[Draggable] Investigate sorting corruption after multiple live drag operations'
state: OPEN
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T19:11:13Z'
updatedAt: '2025-12-07T19:11:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8054'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-07 @tobiu added the `bug` label
- 2025-12-07 @tobiu added the `ai` label
- 2025-12-07 @tobiu assigned to @tobiu

