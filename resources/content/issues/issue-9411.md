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
updatedAt: '2026-03-09T11:11:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9411'
author: tobiu
commentsCount: 0
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

