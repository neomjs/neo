---
id: 9014
title: Refactor Grid Row Selection to use Granular Updates and No-Op Checks
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-06T16:26:44Z'
updatedAt: '2026-02-06T16:44:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9014'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T16:44:47Z'
---
# Refactor Grid Row Selection to use Granular Updates and No-Op Checks

Following the resolution of #9012, we identified that the `RowModel` visual update failure was caused by a logic bug (`isSelected` vs `isSelectedRow`), not an inherent flaw in `row.update()`. However, to fix the regression quickly, we fell back to using `view.update()` (full Body diff) for row selection.

This ticket aims to restore O(1) performance for row selection and further optimize VDOM traffic.

## Current State & Inefficiencies

1.  **Over-Scoping (O(N) Updates):** `selectRow` and `deselectRow` currently trigger `me.view.update()`. This forces the VDOM engine to diff *every* mounted row in the grid body, even though only 1 or 2 rows have changed class. For a grid with 50+ mounted rows, this is wasteful.
2.  **False Positives (No-Op Updates):** `updateRows` toggles the `neo-selected` class and triggers an update *blindly*. Even if the class was already there (or already missing), `row.update()` is called, sending a "no change" delta request to the VDOM worker.

## The Goal: "Smart" Granular Updates

We want to move back to `row.update()` and ensure we only send updates when state *actually* changes.

### 1. Smart `updateRows` Logic
Refactor `Neo.selection.grid.BaseModel.updateRows` to:
- Check the current VDOM state (`row.vdom.cls`) before toggling.
- Return a boolean or count indicating if any mutation occurred.
- Only call `row.update()` if a mutation happened.

### 2. Restore Granular `selectRow` / `deselectRow`
Refactor `RowModel` logic to leverage the fix from #9012 (correct usage of `isSelectedRow`) and switch back to granular updates:
- **Deselect:** `updateRows(oldId)` -> `rowA.update()`.
- **Select:** `updateRows(newId)` -> `rowB.update()`.

### 3. Disjoint Batching
By issuing two separate `row.update()` calls synchronously, the App worker's message batching will automatically combine them into a single payload for the VDOM worker, achieving optimal performance without manual batching logic.

## Implementation Plan

1.  **Modify `updateRows(items, silent)`:**
    - Iterate items.
    - For each item, check `row.vdom.cls.includes(selectedCls)` vs target state.
    - If distinct: mutate `cls`, set `needsUpdate = true`.
    - `if (needsUpdate && !silent) row.update()`.

2.  **Refactor `selectRow(recordId, silent)`:**
    - Call `deselectRow(id)` (triggers granular update for old row).
    - Call `updateRows(recordId, silent)` (triggers granular update for new row).
    - Remove `view.update()` calls.

3.  **Refactor `deselectRow(recordId, silent)`:**
    - Call `updateRows(recordId, silent)`.
    - Remove `view.update()` calls.

This will result in a highly responsive grid selection model that scales with complexity (user interaction speed), not dataset size (mounted rows).

## Timeline

- 2026-02-06T16:26:46Z @tobiu added the `enhancement` label
- 2026-02-06T16:26:46Z @tobiu added the `ai` label
- 2026-02-06T16:26:46Z @tobiu added the `performance` label
- 2026-02-06T16:26:46Z @tobiu added the `core` label
### @tobiu - 2026-02-06T16:31:49Z

**Input from Gemini 3 Pro:**

> ✦ **Clarification on Scope: Granular vs. Column Models**
> 
> As discussed, this optimization targets **Row and Cell** based selection models (`RowModel`, `CellModel`, `CellRowModel`), where interaction typically affects 1-2 items at a time. For these cases, granular `row.update()` calls are O(1) and vastly superior to O(N) body updates.
> 
> **Relationship to Column Models:**
> This optimization does **not** conflict with or degrade `ColumnModel` / `CellColumnModel`.
> *   Column selection affects *all* rows (O(N)).
> *   These models typically trigger a full Body refresh (via `createViewData` or `view.update()`) to apply column-wide classes efficiently in one pass.
> *   They do *not* use `updateRows` to iterate every record ID individually.
> 
> Therefore, `updateRows` remains the specialized tool for granular updates. Making it "smart" (no-op checks) and restoring it as the primary mechanism for Row/Cell selection is a pure win for performance without side effects for column-based logic.

- 2026-02-06T16:33:42Z @tobiu assigned to @tobiu
- 2026-02-06T16:44:07Z @tobiu referenced in commit `55953ff` - "enhancement: Refactor Grid Row Selection to use Granular Updates and No-Op Checks (#9014)"
### @tobiu - 2026-02-06T16:44:29Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the requested optimization for granular grid row updates.
> 
> **Changes:**
> 1.  **Smart `updateRows`:**
>     *   Refactored `BaseModel.updateRows` to iterate logical items/records.
>     *   Added logic to check the current VDOM state (`cls` and `aria-selected`) before applying changes.
>     *   The `NeoArray` operations now use conditional logic based on actual state divergence (`shouldSelect !== alreadySelect`).
>     *   Introduced a `hasChanged` flag. `row.update()` is ONLY called if `hasChanged` is true AND `silent` is false.
> 
> 2.  **Granular `selectRow` / `deselectRow`:**
>     *   Updated `BaseModel.selectRow` and `BaseModel.deselectRow` to remove the costly `view.update()` calls.
>     *   These methods now delegate entirely to `updateRows(recordId, silent)`, passing the `silent` argument through.
>     *   Since `updateRows` now handles the update granularly (on the specific row component), the full body refresh is no longer needed.
> 
> This ensures that row selection operations are now O(1) (or O(k) where k is the number of changed rows) rather than O(N) (body size), and redundant updates for unchanged rows are suppressed.

- 2026-02-06T16:44:47Z @tobiu closed this issue

