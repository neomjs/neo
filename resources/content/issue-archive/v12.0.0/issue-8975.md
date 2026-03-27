---
id: 8975
title: Fix Grid Header Drag Proxy for Row Component Architecture
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-04T00:00:28Z'
updatedAt: '2026-02-04T00:09:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8975'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T00:09:06Z'
---
# Fix Grid Header Drag Proxy for Row Component Architecture

The current implementation of `createDragProxy` in `src/draggable/grid/header/toolbar/SortZone.mjs` is broken due to recent refactoring of the Grid component (specifically, the introduction of `Neo.grid.Row`).

**Current Issues:**
1.  **Styling Loss:** The drag proxy no longer retains the correct grid styling (e.g., even/odd row colors) because the proxy structure doesn't match the new row-based DOM structure.
2.  **Height Calculation:** The proxy height calculation might be incorrect or missing the necessary context.
3.  **Data Retrieval:** While cell content retrieval partly works for simple columns, it needs to be robustly adapted to fetch data from the new `Row` components.

**Goal:**
-   Update `createDragProxy` to correctly reconstruct the visual representation of the dragged column.
-   Ensure the proxy includes the full grid height and proper styling (mimicking the grid body).
-   Adapt the logic to iterate over `Neo.grid.Row` instances to extract cell VDOM.
-   Verify that component-based columns are handled gracefully (or at least don't crash, even if fully cloning them is complex).

**Implementation Details:**
-   Iterate over `grid.body.items` (the Row components) instead of `body.getVdomRoot().cn`.
-   Extract the specific cell VDOM matching the dragged column index from each Row.
-   Reconstruct the VDOM for the proxy to include `neo-grid-row` classes and styles to maintain visual fidelity during the drag operation.

## Timeline

- 2026-02-04T00:00:29Z @tobiu added the `bug` label
- 2026-02-04T00:00:29Z @tobiu added the `ai` label
- 2026-02-04T00:00:46Z @tobiu assigned to @tobiu
- 2026-02-04T00:01:32Z @tobiu added parent issue #8964
- 2026-02-04T00:08:19Z @tobiu referenced in commit `0ee130c` - "fix: Update Drag Proxy for Grid Row Components (#8975)"
### @tobiu - 2026-02-04T00:08:46Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `createDragProxy` to support the new `Neo.grid.Row` architecture.
> - Replaced legacy VDOM traversal (`body.getVdomRoot().cn`) with component-based iteration (`body.items`).
> - Now extracting styling and structure directly from `Row` component instances.
> 
> **Current Status:**
> Styling for rows and cells is improved, but `SortZone` behavior is not fully restored to its previous state. Follow-up tickets will be required to address remaining functional regressions.

- 2026-02-04T00:09:06Z @tobiu closed this issue

