---
id: 8978
title: 'Refactor Selection Models: Phase 1 (Base & Row)'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-04T09:50:11Z'
updatedAt: '2026-02-04T10:23:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8978'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T10:23:10Z'
---
# Refactor Selection Models: Phase 1 (Base & Row)

The `Neo.grid.Row` refactor changes how rows are rendered. `BaseModel` and `RowModel` currently manipulate VDOM directly, which is obsolete.

**Scope:**
1.  **Refactor `BaseModel`:**
    *   Modify `selectRow`, `deselectRow`, and `deselectAllRows`.
    *   Remove legacy VDOM manipulation (e.g., `view.getVdomChild`, `node.cls`).
    *   Instead, update the local `selectedRows` state and then find the corresponding *mounted* `Neo.grid.Row` component(s) in `view.items`.
    *   Trigger an update on the found Row component(s) (e.g., call `row.createVdom()` or force an update) to reflect the new selection state.
2.  **Verify `RowModel`:**
    *   Ensure `onRowClick` and `onNavKeyRow` work with the new component-based rows.
    *   Verify `getRecord(path)` logic remains valid with the new VDOM structure (checking `aria-rowindex`).

**Note:** This is the first sub-task of the Selection Model refactor. Cell/Column models will be handled separately.

## Timeline

- 2026-02-04T09:50:12Z @tobiu added the `enhancement` label
- 2026-02-04T09:50:13Z @tobiu added the `ai` label
- 2026-02-04T09:50:13Z @tobiu added the `refactoring` label
- 2026-02-04T10:21:36Z @tobiu referenced in commit `9fc33c5` - "refactor: Update selection logic for component-based rows (#8978)"
- 2026-02-04T10:21:46Z @tobiu added parent issue #8964
### @tobiu - 2026-02-04T10:21:48Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `BaseModel` to support component-based rows.
> - Removed legacy VDOM manipulation (`view.getVdomChild`).
> - Implemented `getRowComponent` helper.
> - Optimized updates: Now modifies `row.vdom` directly (class/aria) and triggers a scoped `view.update()` with `updateDepth: 2` instead of full Row re-renders.
> - Verified click-based selection works.
> - **Note:** Keyboard navigation is currently broken and will need a separate fix (out of scope for this ticket).

- 2026-02-04T10:23:06Z @tobiu assigned to @tobiu
- 2026-02-04T10:23:10Z @tobiu closed this issue

