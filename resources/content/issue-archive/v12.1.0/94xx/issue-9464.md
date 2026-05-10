---
id: 9464
title: 'TreeGrid Big Data Demo: Implement Controls and Grid Wiring'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T11:07:23Z'
updatedAt: '2026-03-13T11:47:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9464'
author: tobiu
commentsCount: 2
parentIssue: 9461
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T11:43:55Z'
---
# TreeGrid Big Data Demo: Implement Controls and Grid Wiring

### Goal
Develop the `ControlsContainer` to manage the settings for the TreeGrid Big Data demo and ensure it drives the `GridContainer` correctly.

### Implementation Steps

1.  **Reuse Big Data Controls:** Start by replicating the core controls from `examples/grid/bigData/ControlsContainer.mjs` (Amount Rows, Amount Columns, Buffer Rows/Columns, Themes, Filters).
2.  **Tree-Specific Controls:**
    -   Add a `Max Depth` ComboBox (e.g., options: 2, 3, 5, 10).
    -   Add `Expand All` and `Collapse All` buttons (or a single toggle button) to stress-test the `TreeStore`'s bulk `mutate` event handling.
3.  **Grid Wiring:**
    -   Update the `ControlsContainer` logic to interact with the new `TreeGrid` and `TreeStore`.
    -   Ensure changing `Amount Rows`, `Amount Columns`, or `Max Depth` triggers a regeneration of the data in the `MainStore`.
    -   Ensure the text filters (`firstname`, `lastname`) correctly apply to the `TreeStore` (demonstrating hierarchical filtering).
4.  **Grid Dynamic Columns:**
    -   Implement the logic in `GridContainer` (via `afterSetAmountColumns`) to dynamically generate column configurations based on the `ControlsContainer` input, mirroring the flat big data demo but with the first column being a `grid-column-tree`.

## Timeline

- 2026-03-13T11:07:24Z @tobiu added the `enhancement` label
- 2026-03-13T11:07:24Z @tobiu added the `ai` label
- 2026-03-13T11:07:24Z @tobiu added the `grid` label
- 2026-03-13T11:07:43Z @tobiu assigned to @tobiu
- 2026-03-13T11:07:48Z @tobiu added parent issue #9461
- 2026-03-13T11:43:12Z @tobiu referenced in commit `2393935` - "fix: move maxDepth into static config, Implement Controls and Grid Wiring (#9464)"
### @tobiu - 2026-03-13T11:43:34Z

Implemented Max Depth, Expand All, and Collapse All controls. Wired them to the Grid/Store via commit 23939351b. Fixed maxDepth static config placement.

- 2026-03-13T11:43:55Z @tobiu closed this issue
### @tobiu - 2026-03-13T11:47:35Z

Fixed the duplicate `dataField` issue by adding a `name` field to the model and store generation, and binding the tree column to it.


