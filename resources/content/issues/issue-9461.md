---
id: 9461
title: 'Epic: TreeGrid Big Data Demo'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-03-13T11:05:41Z'
updatedAt: '2026-03-13T18:37:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9461'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9462 TreeGrid Big Data Demo: Scaffold Base Directory and Files'
  - '[x] 9463 TreeGrid Big Data Demo: Implement Organic Data Generation Algorithm'
  - '[x] 9464 TreeGrid Big Data Demo: Implement Controls and Grid Wiring'
  - '[x] 9465 TreeGrid Big Data Demo: Styling, Logging, and Final Integration'
  - '[x] 9466 TreeGrid Big Data Demo: Create E2E Tests'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-03-13T18:37:14Z'
---
# Epic: TreeGrid Big Data Demo

### Goal
Create a new flagship demo showcasing the `TreeGrid`'s performance with large, dynamically generated hierarchical datasets (e.g., 20k-50k records). This will combine the hierarchical capabilities of `examples/grid/tree` with the stress-testing volume and controls of `examples/grid/bigData`.

### Architecture & Approach

**1. Data Generation (`examples/grid/treeBigData/MainStore.mjs`)**
- Extend `Neo.data.TreeStore`.
- Implement a custom `generateData(amountNodes, amountColumns, maxDepth)` method.
- **Algorithm**: Generate a flat array of nodes.
  - Create an initial pool of root "folder" nodes (`parentId: null`, `isLeaf: false`).
  - Iterate to generate the remaining nodes up to `amountNodes`.
  - For each new node, randomly select a "folder" node from the existing pool to be its `parentId`.
  - Randomly determine if the new node is a folder (`isLeaf: false`) or a file (`isLeaf: true`). If it's a folder and we haven't hit `maxDepth`, add it to the eligible parent pool.
  - This guarantees a jagged, organic tree structure with varying amounts of children per folder up to the maximum depth.
- Support `Turbo Mode` (lazy record initialization) by setting `autoInitRecords: false` inside the store config.

**2. Grid Component (`examples/grid/treeBigData/GridContainer.mjs`)**
- Extend `Neo.grid.Tree`.
- Column 0: The `grid-column-tree` component displaying the hierarchy.
- Columns 1-N: Dynamically generated data columns (similar to the flat big data demo) to test horizontal scrolling and rendering performance.

**3. Controls (`examples/grid/treeBigData/ControlsContainer.mjs`)**
- Reuse the side-panel controls from the `bigData` demo: `Amount Rows` (Nodes), `Amount Columns`, `Buffer Rows/Columns`, and `Themes`.
- **Tree-Specific Additions**:
  - `Max Depth` combo box (e.g., 2, 3, 5, 10).
  - `Expand All` and `Collapse All` buttons to stress-test the `TreeStore`'s bulk mutate events.
- **Filtering**: Retain the text filters (e.g., `firstname`, `lastname`) to demonstrate the `TreeStore`'s hierarchical filtering capabilities (where parents are retained if children match).

**4. Model (`examples/grid/treeBigData/MainModel.mjs`)**
- Extend `Neo.data.TreeModel` to get `id`, `parentId`, `isLeaf`, `collapsed` inherently.
- Include random payload fields (`firstname`, `lastname`, `numberX`, etc.) in addition.

### Tasks
- [ ] Create base directory and initial files (`MainContainer`, `GridContainer`, `ControlsContainer`, `MainStore`, `MainModel`).
- [ ] Implement the organic tree data generation algorithm in `MainStore`.
- [ ] Wire up the `ControlsContainer` to trigger grid re-renders and tree-specific actions (`Expand/Collapse All`).
- [ ] Ensure CSS/SCSS styling aligns with the standard `bigData` demo.
- [ ] Create E2E tests for the new demo.

## Timeline

- 2026-03-13T11:05:42Z @tobiu added the `enhancement` label
- 2026-03-13T11:05:43Z @tobiu added the `epic` label
- 2026-03-13T11:05:43Z @tobiu added the `ai` label
- 2026-03-13T11:06:00Z @tobiu assigned to @tobiu
- 2026-03-13T11:07:05Z @tobiu added sub-issue #9462
- 2026-03-13T11:07:22Z @tobiu added sub-issue #9463
- 2026-03-13T11:07:48Z @tobiu added sub-issue #9464
- 2026-03-13T11:08:05Z @tobiu added sub-issue #9465
- 2026-03-13T11:09:58Z @tobiu added sub-issue #9466
- 2026-03-13T11:48:40Z @tobiu referenced in commit `2cf2105` - "#9461 enabled the neural link for debugging"
### @tobiu - 2026-03-13T12:07:37Z

WIP

https://github.com/user-attachments/assets/ccf9b1f3-4d21-4a89-a9db-e4839ad14c41

### @tobiu - 2026-03-13T18:37:14Z

resolved

- 2026-03-13T18:37:14Z @tobiu closed this issue

