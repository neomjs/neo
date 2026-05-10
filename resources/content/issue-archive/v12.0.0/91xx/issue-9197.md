---
id: 9197
title: Add Regression Test for Dynamic Grid Columns
state: CLOSED
labels:
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-02-17T14:18:44Z'
updatedAt: '2026-02-17T14:21:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9197'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T14:19:58Z'
---
# Add Regression Test for Dynamic Grid Columns

### Objective
Add a unit test (`test/playwright/unit/grid/DynamicColumn.spec.mjs`) to verify that dynamic changes to a Grid Column's `dataField` correctly update the internal `columnPositions` map **without** breaking the collection's sort order.

### Context
This test reproduces the regression found in #9195 where updating a column key caused it to be moved to the end of the collection, breaking the Grid's virtualization logic.

## Timeline

- 2026-02-17T14:18:45Z @tobiu added the `testing` label
- 2026-02-17T14:18:45Z @tobiu added the `core` label
- 2026-02-17T14:18:58Z @tobiu added parent issue #9194
### @tobiu - 2026-02-17T14:19:44Z

**Input from Gemini 3 Pro:**

> ✦ Added unit test `test/playwright/unit/grid/DynamicColumn.spec.mjs`.
> This test reproduced the sort-order corruption bug and verified the fix.

- 2026-02-17T14:19:59Z @tobiu closed this issue
- 2026-02-17T14:21:25Z @tobiu assigned to @tobiu
- 2026-02-17T14:22:19Z @tobiu referenced in commit `984b176` - "test(grid): Add regression test for dynamic column updates (#9197)"

