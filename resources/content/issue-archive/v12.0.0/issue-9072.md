---
id: 9072
title: 'refactor: Adopt ''internalId'' for Stable DOM Keying (Grid & Table)'
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T10:50:09Z'
updatedAt: '2026-02-09T12:32:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9072'
author: tobiu
commentsCount: 2
parentIssue: 9074
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T12:32:23Z'
---
# refactor: Adopt 'internalId' for Stable DOM Keying (Grid & Table)

**Context:**
Following #9070 (Internal ID implementation) and the List/DataView refactor, the Grid and Table components must also be updated to support stable DOM keying.

**Problem:**
Grids are the primary UI for CRUD operations. Handling "Phantom Records" (newly added rows before save) is a critical use case where `id: null` currently causes issues.

**Task:**
Update `Neo.grid.Container` and `Neo.table.Container` (and their respective Views/Rows) to support `internalId`.

**Requirements:**
1.  **Opt-in Config:** Add `useInternalId` config to Grid/Table Container.
2.  **Row Rendering:** Update row generation to use `store.getInternalId(record)` for the `<tr>` or `<div>` ID.
3.  **Cell Rendering:** Ensure cell IDs are derived consistently.
4.  **Selection Model:** Update `Neo.selection.grid.Model` and `Neo.selection.table.Model` to handle internal ID based lookups.

**Scope:**
- `src/grid/` (View, Row, Container)
- `src/table/`
- Selection Models


## Timeline

- 2026-02-09T10:50:10Z @tobiu added the `ai` label
- 2026-02-09T10:50:10Z @tobiu added the `refactoring` label
- 2026-02-09T10:50:11Z @tobiu added the `core` label
- 2026-02-09T10:51:44Z @tobiu cross-referenced by #9074
- 2026-02-09T10:52:05Z @tobiu added parent issue #9074
- 2026-02-09T11:04:36Z @tobiu referenced in commit `f66e59b` - "refactor: Adopt 'internalId' for Stable DOM Keying (Grid & Table) (#9072)"
### @tobiu - 2026-02-09T11:04:54Z

**Input from Gemini 3 Pro:**

> ✦ **Task Completed: Adopt 'internalId' for Stable DOM Keying (Grid & Table)**
> 
> **Objective:**
> Refactor Grid and Table components to use the stable `internalId` (implemented in #9070) for generating DOM IDs, ensuring robust handling of phantom records (`id: null`), security, and mutability.
> 
> **Implementations:**
> 
> 1.  **Grid & Table Containers (`src/grid/Container.mjs`, `src/table/Container.mjs`):**
>     *   Added `useInternalId` config (defaulting to `true`).
>     *   Propagated this config to the internal `Body` component via `beforeSetBody` and `afterSetUseInternalId`.
> 
> 2.  **Grid & Table Bodies (`src/grid/Body.mjs`, `src/table/Body.mjs`):**
>     *   Added `useInternalId` config (defaulting to `true`).
>     *   Implemented `getRecordId(record)` helper which toggles between `store.getInternalId()` (e.g. `neo-record-1`) and `store.getKey()` based on the config.
>     *   Updated `getLogicalCellId`, `getCellId`, `getRowId` to utilize this abstraction.
>     *   Updated event handlers (`fireCellEvent`, `fireRowEvent`) to resolve records correctly without assuming integer IDs when `useInternalId` is active.
>     *   Updated `onStoreRecordChange` to handle selection state using the correct ID.
> 
> 3.  **Grid Row (`src/grid/Row.mjs`):**
>     *   Updated `createVdom` and `applyRendererOutput` to use `gridBody.getRecordId(record)` for generating DOM IDs and data attributes.
> 
> 4.  **Selection Models (`src/selection/grid/RowModel.mjs`, `src/selection/table/RowModel.mjs`):**
>     *   Refactored `onNavKeyRow`, `onRowClick`, and `updateAnnotations` to use `view.getRecordId(record)`.
>     *   This ensures selection state persists correctly even if the underlying record ID changes (e.g., after saving a phantom record).
> 
> **Outcome:**
> *   **Stable Rendering:** DOM elements now use stable `internalId` by default, preventing re-renders on ID change.
> *   **Phantom Record Support:** New records render correctly without ID collisions.
> *   **Security:** Database keys are no longer exposed in the DOM by default.
> 
> **Status:**
> Code committed and pushed. Ready for List/DataView refactoring (#9071).

- 2026-02-09T12:09:08Z @tobiu referenced in commit `604c7ce` - "refactor: Fix Grid/Table Selection Models for internalId (#9072)"
### @tobiu - 2026-02-09T12:09:25Z

**Input from Gemini 3 Pro:**

> ✦ **Fix: Grid & Table Selection Models Adaptation for `internalId`**
> 
> **Issue:**
> The initial `internalId` refactor broke selection logic because Selection Models were still relying on `store.get(id)` (which expects PKs) or manual ID parsing, both of which fail with `neo-record-x` IDs.
> 
> **Key Fixes:**
> 
> 1.  **Robust Record Resolution (`getRowRecord`, `getRecord`):**
>     *   Added `getRowRecord(id)` to `Grid.BaseModel` and `Table.BaseModel`. This method robustly resolves records from IDs by checking: 1. PK (Fast), 2. Visible Rows (Fast), 3. Internal ID Store Scan (Slow fallback).
>     *   Added `getRecord(logicalId)` to `CellModel` (Grid & Table) to handle logical cell ID parsing and resolution.
>     *   Refactored `GridBody` and `TableBody` methods (`getRecord`, `getRecordFromLogicalId`, event firing) to use these robust lookups.
> 
> 2.  **Selection Model Logic Updates:**
>     *   **RowModel:** Updated `onNavKeyRow` and `onRowClick` to use the new resolution helpers.
>     *   **CellModel:** Updated navigation logic to resolve records correctly.
>     *   **CellRowModel:** Fixed a logic gap where horizontal navigation (Left/Right) failed to update row selection state. Added `onNavKeyColumn` override to explicitly sync row selection.
>     *   **CellColumnModel:** Fixed a visual bug where column highlighting only updated for the clicked row. Added a conditional flush (`view.createViewData()`) when column selection changes to ensure all rows re-render the highlight.
> 
> **Outcome:**
> Grid and Table selection models (Row, Cell, CellColumn, CellRow, CellColumnRow) now fully support `internalId` with correct visual updates and keyboard navigation.

- 2026-02-09T12:32:17Z @tobiu assigned to @tobiu
- 2026-02-09T12:32:23Z @tobiu closed this issue

