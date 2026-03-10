---
id: 9411
title: TreeGrid Unit Tests (Data & Logic)
state: OPEN
labels:
  - enhancement
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:03:42Z'
updatedAt: '2026-03-10T12:35:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9411'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# TreeGrid Unit Tests (Data & Logic)

### Goal
Ensure the core logic of the `TreeStore` and `TreeModel` is robust and handles hierarchical data operations deterministically using the Playwright unit testing environment.

### Details
1.  **Data Operations:**
    - Test `TreeStore` flattening logic: Ensure that expanding/collapsing nodes correctly updates the visible array of records.
    - Test the `#childrenMap` caching: Verify that O(1) lookups return correct child nodes.
    - Test `singleExpand` mode logic.
2.  **Soft Hydration:**
    - Verify that `depth`, `isLeaf`, `siblingCount`, and `siblingIndex` are correctly resolved for raw data objects when `autoInitRecords: false` is used (Turbo Mode).
3.  **Environment:**
    - Create tests in `test/playwright/unit/data/TreeStore.spec.mjs`.

## Timeline

- 2026-03-09T11:03:42Z @tobiu added the `enhancement` label
- 2026-03-09T11:03:43Z @tobiu added the `ai` label
- 2026-03-09T11:03:43Z @tobiu added the `testing` label
- 2026-03-09T11:03:43Z @tobiu added the `grid` label
- 2026-03-09T11:03:54Z @tobiu added parent issue #9404
- 2026-03-09T11:11:08Z @tobiu assigned to @tobiu
- 2026-03-10T12:34:26Z @tobiu referenced in commit `0db923e` - "test(data): Add initial TreeStore Splice mechanics unit test (#9411)"
### @tobiu - 2026-03-10T12:35:14Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed the initial test file `test/playwright/unit/data/TreeStore.spec.mjs` which perfectly reproduces the structural mutation bugs we are seeing in the `TreeGrid`.
> 
> Here are some hints and specific bugs that need to be explored in the next session based on our latest findings:
> 
> 1. **Initial Ingestion Bug:** During Store initialization, the projection algorithm is dropping nodes. With the `MainStore` test data, only 6 nodes are rendered initially instead of 7 (`child-1-2-2` / `Row.mjs` is completely missing from `store.items`).
> 2. **`collectVisibleDescendants` Logic:** When collapsing a deeply nested folder (like `component`), the `visibleDescendants` array incorrectly gathers root-level siblings (like `package.json` and `README.md`) and slices them out of the grid. This suggests the structural maps or the tree traversal loop has a scoping bug.
> 3. **Row Pool Sizing Bug (`grid.Body`):** In the demo, the grid initializes 53 row components for only 7 nodes. This completely breaks the `itemIndex = i % poolSize` recycling math, causing the "7-click delay" for UI updates because `updateContent` hits an early-exit condition on the exact same row/record reference. 
> 4. **VDOM invalidation:** Once the `TreeStore.splice` and row pooling math are fixed, we still need to ensure that `grid.Row#updateContent` properly invalidates and re-renders if a `Record` mutates internally, even if `force: false` is passed. Adding a `lastRecordVersion` check to `updateContent` is likely the fix here.


