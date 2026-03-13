---
id: 9460
title: 'Grid: Column Drag & Drop Integration & State Transitions'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:28:31Z'
updatedAt: '2026-03-13T10:28:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9460'
author: tobiu
commentsCount: 0
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid: Column Drag & Drop Integration & State Transitions

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
The Drag & Drop interface (`SortZone`) acts as an implicit state mutator for a column's `locked` property. If a user drags an unlocked column and drops it between two locked columns, it should adopt their locked state. Furthermore, changing a column's locked state at runtime fundamentally alters the layout of every row.

**Task:**
1. **DD State Inference:** Update `src/draggable/grid/header/toolbar/SortZone.mjs` (`switchItems` / `moveTo`). When a column is dropped, infer its new `locked` state based on its immediate neighbors at the `toIndex`. Set the new `locked` state on the column.
2. **Runtime Updates:** Implement `afterSetLocked` in `src/grid/column/Base.mjs`. 
   - When the state changes, the column physically moves between the "Pooled" array and the "Permanent" array across all Row VDOMs.
   - Trigger a deep Grid body refresh (`gridContainer.body.createViewData(false, true)`) to cleanly rebuild the DOM architecture for the new state, leveraging the existing optimized recycling logic with `force=true`.
3. Ensure the `HeaderToolbar` also updates to correctly reflect the `.neo-locked-*` classes on the header buttons.

## Timeline

- 2026-03-13T10:28:40Z @tobiu added parent issue #9456
- 2026-03-13T10:28:48Z @tobiu added the `enhancement` label
- 2026-03-13T10:28:48Z @tobiu added the `grid` label
- 2026-03-13T10:28:48Z @tobiu added the `ai` label
- 2026-03-13T10:28:51Z @tobiu assigned to @tobiu

