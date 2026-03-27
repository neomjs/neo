---
id: 9463
title: 'TreeGrid Big Data Demo: Implement Organic Data Generation Algorithm'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T11:07:07Z'
updatedAt: '2026-03-13T11:39:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9463'
author: tobiu
commentsCount: 1
parentIssue: 9461
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T11:39:22Z'
---
# TreeGrid Big Data Demo: Implement Organic Data Generation Algorithm

### Goal
Implement a highly efficient, organic data generation algorithm within `Neo.examples.grid.treeBigData.MainStore` to create a massive, jagged tree structure for stress testing.

### Requirements

1.  **Extend TreeStore:** `MainStore` must extend `Neo.data.TreeStore`.
2.  **Organic Algorithm:** Implement a `generateData(amountNodes, amountColumns, maxDepth)` method.
    -   Do not use strict, symmetrical loops (e.g., exactly 10 children per node).
    -   Instead, generate a flat array of records.
    -   Create an initial pool of "folder" nodes.
    -   For subsequent nodes, randomly assign a `parentId` from the eligible folder pool.
    -   Randomly determine if a node is a leaf or a folder. If it's a folder and hasn't reached `maxDepth`, add its `id` to the parent pool.
3.  **Data Volume:** The default `amountRows_` (which acts as total nodes here) should be around 20,000 to match the big data demo.
4.  **Payload Data:** Generate random data for columns (e.g., `firstname`, `lastname`, `number1`, `number2`, etc.) alongside the tree-specific fields (`id`, `parentId`, `isLeaf`, `collapsed`).
5.  **Turbo Mode:** The `autoInitRecords` config should be set to `false` on the store to utilize the `TreeStore`'s lazy instantiation (Turbo Mode).

## Timeline

- 2026-03-13T11:07:08Z @tobiu added the `enhancement` label
- 2026-03-13T11:07:08Z @tobiu added the `ai` label
- 2026-03-13T11:07:08Z @tobiu added the `grid` label
- 2026-03-13T11:07:18Z @tobiu assigned to @tobiu
- 2026-03-13T11:07:22Z @tobiu added parent issue #9461
- 2026-03-13T11:38:26Z @tobiu referenced in commit `e44bd9c` - "feat: Implement organic tree data generation algorithm (#9463)"
### @tobiu - 2026-03-13T11:38:59Z

Data generation algorithm and correct Tree base classes applied via commit e44bd9c8a.

- 2026-03-13T11:39:22Z @tobiu closed this issue

