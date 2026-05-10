---
id: 7170
title: Grid Cells Display Stale Data After Record Updates (Surgical Update Issue)
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-08-07T18:33:06Z'
updatedAt: '2025-08-07T18:35:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7170'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-07T18:35:43Z'
---
# Grid Cells Display Stale Data After Record Updates (Surgical Update Issue)

**Status:** Open (Fix implemented in `benchmarks` project, needs framework-level integration)

**Description:**
When records in a `Neo.grid.Container`'s store are updated, particularly via `bulkUpdateRecords` or individual `record.set()` calls, the visual representation of the grid's cells may not immediately reflect these changes. The data in the store is correct, but the rendered cells display old values. This issue is resolved by scrolling the grid, which forces a full re-render of the visible rows.

**Symptoms:**
*   Cells in the grid do not update visually after their corresponding record data changes.
*   Scrolling the grid causes the correct, updated values to appear.
*   This is most apparent when updating records that are within the currently visible (mounted) range of the grid.
*   The `getRowId()` method's modulo logic, while essential for virtual rendering, can lead to incorrect VDOM updates if `updateCellNode` is called for records outside the mounted range, as the `rowId` might map to a currently rendered row that belongs to a different record.

**Affected Components:**
*   `Neo.grid.Container`
*   `Neo.grid.Body`

**Root Cause:**
The `Neo.grid.Body#onStoreRecordChange` method, which is responsible for surgically updating individual cells when a record changes, was attempting to update VDOM nodes for records that were not currently within the grid's mounted (visible + buffer) row range. Due to the modulo operator in `getRowId()`, a `rowIndex` outside the mounted range could generate a `cellId` that corresponds to a *different* record's currently rendered cell, leading to incorrect visual updates.

Additionally, when `bulkUpdateRecords` is used, individual `record.set()` calls trigger `onStoreRecordChange` while `body.silentVdomUpdate` is `true`. Although `updateCellNode` correctly modifies the VDOM tree, the subsequent `body.update()` call (after `silentVdomUpdate` is `false`) might not be sufficiently sensitive to these internal VDOM changes, especially if only child nodes within an array are replaced without changing the parent array's reference.

**Proposed Fix (Implemented in `benchmarks` project):**
The `onStoreRecordChange` method in `Neo.grid.Body.mjs` has been modified to ensure that `updateCellNode` is only called for records whose `rowIndex` falls within the `mountedRows` range (`me.mountedRows[0]` and `me.mountedRows[1]`). This prevents surgical updates on non-rendered rows and avoids the `getRowId()` modulo issue for out-of-view records.

**Relevant Code Snippet (Change in `node_modules/neo.mjs/src/grid/Body.mjs`):**

```javascript
// Inside onStoreRecordChange({fields, record}) { ... }

// Before (simplified, showing the problematic part):
// ...
// } else { // if not a colspan field change
//     for (column of me.parent.columns.items)
//         // ... logic to update component columns ...
//     }
//     fields.forEach(field => {
//         // ... logic to update regular fields ...
//         needsCellUpdate = me.updateCellNode(record, field.name);
//         needsUpdate     = needsUpdate || needsCellUpdate
//     })
// }
// needsUpdate && me.update()


// After:
// ...
// } else { // if not a colspan field change
//     if (rowIndex >= mountedRows[0] && rowIndex <= mountedRows[1]) { // Added check
//         for (column of me.parent.columns.items) {
//             if (
//                 column instanceof Neo.grid.column.Component &&
//                 Neo.typeOf(column.component === 'Function') &&
//                 !fieldNames.includes(column.dataField)
//             ) {
//                 needsCellUpdate = me.updateCellNode(record, column.dataField);
//                 needsUpdate     = needsUpdate || needsCellUpdate
//             }
//         }
//
//         fields.forEach(field => {
//             if (field.name === me.selectedRecordField) {
//                 if (selectionModel.ntype === 'selection-grid-rowmodel') {
//                     recordId = record[me.store.getKeyProperty()];
//
//                     selectionModel[field.value ? 'selectRow' : 'deselectRow'](recordId)
//                 }
//             } else {
//                 needsCellUpdate = me.updateCellNode(record, field.name);
//                 needsUpdate     = needsUpdate || needsCellUpdate
//             }
//         })
//     }
// }
// needsUpdate && me.update()
```

**Steps to Reproduce:**
1.  Navigate to the `interactive-benchmark-neo` application.
2.  Click "Create 1k rows" or "Create 10k rows".
3.  Click "Update every 10th row".
4.  Observe that the labels of the updated rows do not change visually (or show incorrect values if the `rowIndex` modulo issue was active).
5.  Scroll the grid slightly.
6.  Observe that the labels now correctly display "updated row X".

**Impact:**
This bug leads to a visual desynchronization between the data model and the rendered UI, causing a poor user experience and undermining the perceived responsiveness of the grid.

**Priority:** High (Affects core grid functionality and performance showcase credibility)

## Timeline

- 2025-08-07T18:33:06Z @tobiu assigned to @tobiu
- 2025-08-07T18:33:07Z @tobiu added the `bug` label
- 2025-08-07T18:34:47Z @tobiu referenced in commit `430d716` - "Grid Cells Display Stale Data After Record Updates (Surgical Update Issue) #7170"
- 2025-08-07T18:35:43Z @tobiu closed this issue

