---
id: 9483
title: 'Grid: Implement Reactive locked Config and Run-Time Column Reordering'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T11:10:28Z'
updatedAt: '2026-03-16T11:31:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9483'
author: tobiu
commentsCount: 1
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T11:31:43Z'
---
# Grid: Implement Reactive locked Config and Run-Time Column Reordering

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
To support locking columns dynamically at run-time (e.g., from a context menu) or restoring saved grid states, the `locked` configuration needs to be fully reactive. This requires a robust architectural pipeline to ensure all layers of the Grid (the `columns` collection, `header.Toolbar` items, layout engine, and `Body` VDOM) stay perfectly synchronized without memory leaks or tearing.

**Implementation Plan:**

1. **`grid.column.Base`:**
   - Add a reactive `locked_` config (`'start' | 'end' | null`).
   - Implement `afterSetLocked(value, oldValue)`. If `oldValue !== undefined`, trigger `this.parent.onColumnLockChange(this)`.

2. **`grid.header.Button`:**
   - Ensure the button receives the `locked` value and updates its CSS classes (e.g., `neo-locked-start`).

3. **`grid.Container`:**
   - Extract the sorting logic from `createColumns()` into a reusable `sortColumns(columnsArray)` method.
   - Implement `onColumnLockChange(column)`.
     - Re-sort the physical `me.columns` array using `sortColumns()`.
     - Re-sort the `headerToolbar.items` array to match the new column order (without destroying/recreating instances).
     - Call `headerToolbar.passSizeToBody(false)` to trigger the mathematical layout recalculation.

4. **`grid.Body`:**
   - After a column reorder, the VDOM must be fully regenerated to ensure cell pooling correctly projects the new column order and X-coordinates into the visible cells.
   - Ensure the layout pipeline gracefully cascades into `body.createViewData()` to re-render the visible rows.

## Timeline

- 2026-03-16T11:10:30Z @tobiu added the `enhancement` label
- 2026-03-16T11:10:30Z @tobiu added the `ai` label
- 2026-03-16T11:10:30Z @tobiu added the `grid` label
- 2026-03-16T11:10:40Z @tobiu assigned to @tobiu
- 2026-03-16T11:10:52Z @tobiu added parent issue #9456
- 2026-03-16T11:30:24Z @tobiu referenced in commit `b7bf06e` - "Grid: Implement Reactive locked Config and Run-Time Column Reordering (#9483)"
### @tobiu - 2026-03-16T11:30:39Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the implementation for this sub-task (#9483).
> 
> **Changes Implemented:**
> 1. **`grid.column.Base`:** Added the reactive `locked_` config (`'start'`, `'end'`, `null`) and implemented `afterSetLocked()` to trigger `parent.onColumnLockChange(this)`.
> 2. **`grid.header.Button`:** Added the reactive `locked_` config and implemented `afterSetLocked()` to dynamically update the `neo-locked-start` and `neo-locked-end` CSS classes.
> 3. **`grid.Container`:**
>     - Extracted column sorting logic into the `sortColumns(columnsArray)` method for reusability.
>     - Implemented `onColumnLockChange(column)` which handles the synchronization pipeline.
>     - Used the Container API `moveTo()` inside a `silentVdomUpdate` block to bulk-reorder the header buttons cleanly without destroying instances.
>     - Re-ordered the `me.columns` collection cleanly using `clearSilent()` and `add()` to avoid triggering redundant `mutate` events that would otherwise ping-pong the `aria-colcount`.
>     - Called `headerToolbar.passSizeToBody(false)` to mathematically recalculate logical X coordinates.
>     - Explicitly called `me.body.createViewData()` at the end of the pipeline to trigger a full row/cell re-render, ensuring the new column order and styles are immediately reflected in the viewport via the cell pooling engine.

- 2026-03-16T11:31:43Z @tobiu closed this issue
- 2026-03-16T12:22:47Z @tobiu cross-referenced by #9460

