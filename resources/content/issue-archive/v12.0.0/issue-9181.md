---
id: 9181
title: Fix Grid Column Drag & Drop Regression
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-16T10:25:01Z'
updatedAt: '2026-02-16T10:28:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9181'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T10:28:19Z'
---
# Fix Grid Column Drag & Drop Regression

Recent optimizations in `Neo.grid.Body` introduced a `force` parameter to `createViewData(silent=false, force=false)`.
The `SortZone` class currently calls this method without arguments, defaulting `force` to `false`.
This prevents the grid body from correctly refreshing after a column reorder.
We need to update `onDragEnd` to call `createViewData(false, true)` to ensure the view reflects the new column order.


## Timeline

- 2026-02-16T10:25:02Z @tobiu added the `bug` label
- 2026-02-16T10:25:02Z @tobiu added the `ai` label
- 2026-02-16T10:25:02Z @tobiu added the `regression` label
- 2026-02-16T10:25:11Z @tobiu added parent issue #9106
- 2026-02-16T10:26:32Z @tobiu referenced in commit `991010f` - "fix(draggable): Force grid view update on column drag end (#9181)"
- 2026-02-16T10:28:19Z @tobiu closed this issue
- 2026-02-16T10:28:46Z @tobiu assigned to @tobiu

