---
id: 9183
title: 'Enforce hideMode: ''visibility'' for Component Grid Columns'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-16T11:39:06Z'
updatedAt: '2026-02-16T11:46:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9183'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T11:46:08Z'
---
# Enforce hideMode: 'visibility' for Component Grid Columns

Component-based grid columns currently default to `hideMode: 'removeDom'` (inherited from `Neo.grid.column.Base`).
This enables cell pooling, which uses index-based IDs (e.g., `__cell-0`).

However, this breaks `SortZone`'s "surgical DOM move" logic during drag-and-drop:
1.  **ID Instability:** Reordering columns changes the mapping of dataFields to indices.
2.  **Restoration Failure:** `SortZone` restores content to the old ID (e.g., `__cell-5`), but the grid renders the column at a new ID (e.g., `__cell-3`).
3.  **State Loss:** This causes the VDOM engine to "replace" rather than "move" components, destroying internal state (Canvas, etc.) or leaving cells empty ("pruned").

**The Fix:**
Update `Neo.grid.column.Component` to default to `hideMode: 'visibility'`.
This ensures:
1.  **Stable IDs:** Cells use `__dataField` IDs, which persist across reorders.
2.  **Zero DOM Thrashing:** Cells are toggled via visibility, avoiding insert/remove operations, aligning with the Grid's "Fixed-DOM-Order" strategy.
3.  **Drag Stability:** `SortZone` can correctly restore content to the stable ID.

This will implicitly fix issues with `GitHubOrgs`, `Heuristics`, and other component columns.

## Timeline

- 2026-02-16T11:39:07Z @tobiu added the `bug` label
- 2026-02-16T11:39:07Z @tobiu added the `ai` label
- 2026-02-16T11:39:08Z @tobiu added the `architecture` label
- 2026-02-16T11:39:20Z @tobiu added parent issue #9106
- 2026-02-16T11:42:34Z @tobiu assigned to @tobiu
- 2026-02-16T11:45:51Z @tobiu referenced in commit `d9d46e5` - "fix(grid): Enforce hideMode: 'visibility' for Component Columns (#9183)"
- 2026-02-16T11:46:08Z @tobiu closed this issue

