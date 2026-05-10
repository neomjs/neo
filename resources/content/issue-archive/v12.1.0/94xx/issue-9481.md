---
id: 9481
title: Auto-detect `isTreeGrid` config based on the Store instance
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-15T18:54:49Z'
updatedAt: '2026-03-15T18:55:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9481'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T18:55:52Z'
---
# Auto-detect `isTreeGrid` config based on the Store instance

Currently, developers are forced to manually set `isTreeGrid: true` on `Neo.grid.Container` when using a `TreeStore` (as seen in `examples/grid/tree/GridContainer.mjs` and `examples/grid/treeBigData/GridContainer.mjs`).

Since a TreeGrid relies entirely on a `TreeStore` for its hierarchical logic, we can improve the DX by auto-detecting this state. 

This enhancement modifies `afterSetStore()` in `src/grid/Container.mjs` to automatically set `me.isTreeGrid = value?.isTreeStore === true`, eliminating the need for manual configuration and ensuring ARIA roles are always correct even if the store changes dynamically.

In addition, it applies the "Anchor & Echo" Knowledge Base Enhancement Strategy to the `store_` configs in both `grid.Container` and `grid.Body`, clarifying their support for both flat stores and hierarchical `TreeStore` instances, and fixes copy-paste JSDoc typing errors for the `afterSetStore` method params.

## Timeline

- 2026-03-15T18:54:50Z @tobiu added the `enhancement` label
- 2026-03-15T18:54:51Z @tobiu added the `ai` label
- 2026-03-15T18:54:51Z @tobiu added the `grid` label
- 2026-03-15T18:55:16Z @tobiu referenced in commit `938d435` - "feat(grid): Auto-detect isTreeGrid config based on the Store instance (#9481)"
- 2026-03-15T18:55:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-15T18:55:37Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the auto-detection of `isTreeGrid` based on `store.isTreeStore` within `afterSetStore` for the Grid Container. The manual `isTreeGrid` config has been removed from the relevant examples (`examples/grid/tree` and `examples/grid/treeBigData`). Additionally, JSDocs for the `store_` and `afterSetStore` methods in both `Container.mjs` and `Body.mjs` have been enhanced to apply the "Anchor & Echo" strategy, correcting type definitions and adding broader conceptual context. Code has been committed and pushed.

- 2026-03-15T18:55:52Z @tobiu closed this issue

