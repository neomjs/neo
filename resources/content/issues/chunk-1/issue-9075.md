---
id: 9075
title: 'refactor: Optimize Grid Selection Models Architecture'
state: OPEN
labels:
  - no auto close
  - ai
  - refactoring
  - core
assignees: []
createdAt: '2026-02-09T12:18:06Z'
updatedAt: '2026-02-09T12:25:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9075'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# refactor: Optimize Grid Selection Models Architecture

**Context:**
Following the implementation of `internalId` (#9070) and subsequent fixes for selection logic, we identified significant technical debt in the `src/selection/grid` namespace. The current architecture suffers from deep inheritance chains, duplicated logic, and brittle type-checking heuristics.

**Problem:**
1.  **Deep Inheritance:** The chain `CellColumnRowModel -> CellRowModel -> CellModel -> BaseModel` forces hybrid models to override logic from ancestors that doesn't fit (e.g., `CellRowModel` having to manually sync row selection because `CellModel` ignores it).
2.  **Logic Duplication:** `CellColumnModel` and `CellColumnRowModel` duplicate the "Conditional Flush" logic (checking `isEqual` on `selectedColumns`) to ensure visual updates.
3.  **Brittle `updateRows`:** `BaseModel.updateRows` uses string parsing (`includes('__')`) to distinguish between Cell IDs and Record IDs. This is fragile and should be polymorphic.
4.  **Column Selection Redundancy:** Multiple models manage column selection using copied logic.

**Objectives:**
1.  **Introduce Mixins:** Refactor `RowSelection` and `ColumnSelection` into reusable Mixins. Use composition instead of deep inheritance for hybrid models (e.g., `CellModel` + `RowSelectionMixin`).
2.  **Polymorphic Updates:** Refactor `updateRows` to delegate to a polymorphic `updateItem(item)` method on the subclass, eliminating the need for `isCell` checks in the base class.
3.  **Centralize Flush Logic:** Move the `selectedColumns` change detection and flush logic into a shared location (Mixin or Base).
4.  **Normalize IDs:** Ensure consistent handling of `internalId` vs `recordId` across all models.

**Scope:**
- `src/selection/grid/BaseModel.mjs`
- `src/selection/grid/RowModel.mjs`
- `src/selection/grid/CellModel.mjs`
- `src/selection/grid/ColumnModel.mjs`
- `src/selection/grid/CellRowModel.mjs`
- `src/selection/grid/CellColumnModel.mjs`
- `src/selection/grid/CellColumnRowModel.mjs`


## Timeline

- 2026-02-09T12:18:07Z @tobiu added the `ai` label
- 2026-02-09T12:18:07Z @tobiu added the `refactoring` label
- 2026-02-09T12:18:07Z @tobiu added the `core` label
- 2026-02-09T12:25:41Z @tobiu added the `no auto close` label

