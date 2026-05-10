---
id: 7192
title: Incorrect aria-rowcount in grid
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-08-15T07:55:57Z'
updatedAt: '2025-08-15T07:56:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7192'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-15T07:56:40Z'
---
# Incorrect aria-rowcount in grid

**Describe the bug**
The `aria-rowcount` attribute for a grid was calculated incorrectly. It was adding 2 to the store's record count instead of 1. The `aria-rowcount` is 1-based and should include the column header row, so the correct calculation is `store.count + 1`.

**To Reproduce**
Steps to reproduce the behavior:
1. Create a grid with a store containing `n` records.
2. Inspect the DOM of the grid container.
3. Observe the `aria-rowcount` attribute.
4. The value was `n + 2`, which is incorrect.

**Expected behavior**
The `aria-rowcount` attribute should have been `n + 1`. For example, a grid with 100 data rows should have an `aria-rowcount` of 101 (100 rows + 1 header row).

**Additional context**
The issue was located in `src/grid/Container.mjs` within the `updateRowCount()` method.

The fix was to change:
`me.getVdomRoot()['aria-rowcount'] = finalCount + 2;`
to:
`me.getVdomRoot()['aria-rowcount'] = finalCount + 1;`

## Timeline

- 2025-08-15T07:55:57Z @tobiu assigned to @tobiu
- 2025-08-15T07:55:58Z @tobiu added the `bug` label
- 2025-08-15T07:56:33Z @tobiu referenced in commit `c7654ad` - "Incorrect aria-rowcount in grid #7192"
- 2025-08-15T07:56:40Z @tobiu closed this issue

