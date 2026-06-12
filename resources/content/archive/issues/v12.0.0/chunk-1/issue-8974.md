---
id: 8974
title: 'refactor: Cleanup Neo.grid.Body and optimize Row/Body responsibilities (#8964)'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-03T21:34:15Z'
updatedAt: '2026-02-03T23:19:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8974'
author: tobiu
commentsCount: 0
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T23:19:54Z'
---
# refactor: Cleanup Neo.grid.Body and optimize Row/Body responsibilities (#8964)

The current `Neo.grid.Body` implementation retains several methods and imports that are either obsolete (due to the `Neo.grid.Row` refactoring) or misplaced (logic that belongs in `Neo.grid.Row`).

**Goal:** Clean up and optimize `Neo.grid.Body` and `Neo.grid.Row` by removing dead code and enforcing stricter separation of concerns.

**Scope:**
1.  **Remove Unused Imports:**
    *   `Neo.grid.Body`: Remove `NeoArray` import (check usage).
2.  **Move/Refactor ID Generation:**
    *   `getCellId`: Currently in Body, called by Row. Should this move to Row? A cell ID is intrinsically tied to the Row and Column. If Row generates its own VDOM, it should probably generate its own cell IDs.
    *   `getRowId`: Body needs this for pooling (`createRowPool`) and finding rows (`getRowId(rowIndex)`). This likely needs to stay in Body or be a static helper, as Body manages the pool.
3.  **Move/Refactor Styling:**
    *   `getRowClass`: Currently in Body, called by Row. Row should probably own its own class logic, or Body passes configuration.
4.  **Review other legacy methods:**
    *   Check for other methods in Body that were used by the old `createRow` implementation but are now unused.

**Specific Tasks:**
1.  **Analyze `src/grid/Body.mjs`:** Identify unused imports and methods.
2.  **Analyze `src/grid/Row.mjs`:** Identify dependencies on Body that should be internal.
3.  **Refactor:** Move `getCellId` logic to `Row.mjs` (as `getCellId(column)`)? Or keep it central? Central ensures consistency for external lookups (e.g. SelectionModel).
    *   *Decision:* `GridBody` needs to lookup cells/rows for selection and navigation. So `getCellId(rowIndex, dataField)` MUST exist on Body (or be easily deriving). If we move it to Row, Body can't easily calculating ID without finding the Row instance first.
    *   *Refinement:* Keep `getCellId` on Body for global access, but ensure `Row` uses it efficiently.
4.  **Cleanup:** Remove `NeoArray` if unused. Remove `getRowClass` from Body and implement `baseCls` / `cls` logic in `Row`? `Row` already has `rowCls` logic. `GridBody.getRowClass` was an override point. If we remove it, we break extensibility? We should check if `Row` calls `gridBody.getRowClass`.

Let's start by analyzing the files.

## Timeline

- 2026-02-03T21:34:17Z @tobiu added the `ai` label
- 2026-02-03T21:34:17Z @tobiu added the `refactoring` label
- 2026-02-03T21:34:36Z @tobiu assigned to @tobiu
- 2026-02-03T21:34:44Z @tobiu added parent issue #8964
- 2026-02-03T22:03:04Z @tobiu referenced in commit `66d5f85` - "#8974 wip"
- 2026-02-03T22:17:55Z @tobiu referenced in commit `2582e3a` - "#8974 cleanup"
- 2026-02-03T22:26:50Z @tobiu referenced in commit `7ad37de` - "#8974 fixed getColumnCells()"
- 2026-02-03T22:57:58Z @tobiu referenced in commit `ef16f69` - "#8974 fixed getRecordByRowId()"
- 2026-02-03T23:19:07Z @tobiu referenced in commit `2e1c58a` - "#8974 removed getRowClass()"
- 2026-02-03T23:19:55Z @tobiu closed this issue

