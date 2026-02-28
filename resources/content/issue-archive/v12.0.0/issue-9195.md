---
id: 9195
title: Fix GridBody Column Position Sync on DataField Change
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-17T13:35:58Z'
updatedAt: '2026-02-17T14:22:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9195'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T14:22:06Z'
---
# Fix GridBody Column Position Sync on DataField Change

### Objective
Fix a regression in `Neo.grid.Body` where changing a column's `dataField` at runtime (e.g., toggling between Total/Public/Private stats) desynchronizes the `columnPositions` map and Row recycling logic, causing rendering artifacts during horizontal scrolling.

### Root Cause Analysis
1.  **Stale `columnPositions` keys:** The `GridBody` maintains a `columnPositions` collection keyed by `dataField`. When `dataField` changes on the column, the map key remains the old name, breaking lookups during `updateMountedAndVisibleColumns`.
2.  **Stale `oldCellMap` keys:** In `Neo.grid.Row`, the recycling logic uses `oldCellMap` keyed by `dataField` to find reusable DOM nodes. If the column's `dataField` changes but the VDOM nodes still have the old `data-field` attribute, recycling fails or misidentifies cells.

### Tasks
1.  **Sync `columnPositions`:** Ensure that when a Column's `dataField` is updated, the `GridBody`'s `columnPositions` map is updated to reflect the new key.
2.  **Robust Recycling:** Verify `Row` recycling logic can handle `dataField` transitions, possibly by forcing a full re-render (non-recycled) when column definitions change significantly.
3.  **Verification:** Verify that horizontal scrolling works seamlessly after a Data Mode switch in DevIndex.

## Timeline

- 2026-02-17T13:36:00Z @tobiu added the `bug` label
- 2026-02-17T13:36:00Z @tobiu added the `ai` label
- 2026-02-17T13:36:00Z @tobiu added the `core` label
- 2026-02-17T13:36:18Z @tobiu added parent issue #9194
- 2026-02-17T13:37:29Z @tobiu referenced in commit `b3c9b2c` - "feat(core): Implement virtual fields and fix grid data mode switching (#9193, #9195)"
- 2026-02-17T13:38:54Z @tobiu assigned to @tobiu
- 2026-02-17T13:40:37Z @tobiu cross-referenced by #9193
- 2026-02-17T14:18:45Z @tobiu cross-referenced by #9197
- 2026-02-17T14:20:21Z @tobiu cross-referenced by #9198
### @tobiu - 2026-02-17T14:21:50Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the regression by updating `Neo.grid.column.Base#afterSetDataField` to update the `columnPositions` map in-place (preserving array order) instead of using `remove` + `add` (which appended to the end).
> Verified with unit test `test/playwright/unit/grid/DynamicColumn.spec.mjs`.

- 2026-02-17T14:22:06Z @tobiu closed this issue
- 2026-02-17T14:22:19Z @tobiu referenced in commit `faeb66f` - "fix(grid): Preserve columnPositions order when updating dataField (#9195)"

