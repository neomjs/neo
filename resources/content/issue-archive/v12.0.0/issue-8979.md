---
id: 8979
title: 'Refactor Selection Models: Phase 2 (Cell & Column)'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-04T10:23:04Z'
updatedAt: '2026-02-04T10:37:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8979'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T10:37:19Z'
---
# Refactor Selection Models: Phase 2 (Cell & Column)

Refactor `Neo.selection.grid.CellModel` and related classes to work with the new `Neo.grid.Row` component architecture.

**Scope:**
1.  **Refactor `CellModel.mjs`:**
    *   Update selection logic to target `Neo.grid.Row` components instead of monolithic VDOM.
    *   Ensure cell selection classes (`neo-selected`) are applied correctly to the specific cell VDOM node within the Row component.
    *   Leverage `getRowComponent` helper from `BaseModel`.
2.  **Verify/Update Subclasses:**
    *   `CellRowModel.mjs`
    *   `ColumnModel.mjs`
    *   `CellColumnModel.mjs`
    *   `CellColumnRowModel.mjs`
3.  **Ensure Consistency:**
    *   Make sure cell selection works visually and logically (state sync).
    *   Verify click interactions.

## Timeline

- 2026-02-04T10:23:05Z @tobiu added the `enhancement` label
- 2026-02-04T10:23:05Z @tobiu added the `ai` label
- 2026-02-04T10:23:05Z @tobiu added the `refactoring` label
- 2026-02-04T10:23:17Z @tobiu added parent issue #8964
- 2026-02-04T10:36:48Z @tobiu referenced in commit `5b6985b` - "refactor: Override select/deselect in Grid BaseModel to support component rows (#8979)"
### @tobiu - 2026-02-04T10:37:00Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `BaseModel` to support generic `select`/`deselect` calls (used by Cell/Column models) with component-based rows.
> - Overridden `select`, `deselect`, and `deselectAll`.
> - These overrides set `view.updateDepth = 2` before calling `super`.
> - This ensures that VDOM changes made by the base `Model` logic (which expands references) are correctly picked up during the update cycle, fixing cell selection rendering.
> - Code remains DRY and respects the inheritance chain.

- 2026-02-04T10:37:06Z @tobiu assigned to @tobiu
- 2026-02-04T10:37:19Z @tobiu closed this issue

