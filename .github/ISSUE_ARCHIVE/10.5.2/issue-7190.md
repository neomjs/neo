---
id: 7190
title: Grid aria-colcount
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-14T09:55:54Z'
updatedAt: '2025-08-14T09:56:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7190'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-14T09:56:24Z'
---
# Grid aria-colcount

**Reported by:** @tobiu on 2025-08-14

**Is your feature request related to a problem? Please describe.**
The grid container is missing the `aria-colcount` attribute on its wrapper element. This is important for accessibility, especially for screen readers to announce the total number of columns in the grid.

Currently, we have an `updateRowCount()` method which sets `aria-rowcount`. We need a similar mechanism for the column count.

This is also a prerequisite for testing buffered columns.

**Describe the solution you'd like**
1.  Add `'aria-colcount': 0` to the grid's wrapper vdom node in `src/grid/Container.mjs`.
2.  Create a new method `updateColCount()` which sets the `aria-colcount` attribute based on the `columns.count` reactive property and triggers a `me.update()`.
3.  The `columns` collection gets a `mutate` listener assigned directly within `createColumns()`. This listener calls `onColumnsMutate()`.
4.  A new `onColumnsMutate()` method calls `updateColCount()` whenever columns are added or removed from the collection at runtime.
5.  Call `updateColCount()` at the end of `construct()` to set the initial value.
6.  Call `updateColCount()` inside `afterSetColumns()` to handle cases where the entire columns config is replaced.

