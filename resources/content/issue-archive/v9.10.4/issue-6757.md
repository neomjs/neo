---
id: 6757
title: 'grid.column.AnimatedCurrency: cellRenderer() broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-06-06T10:28:40Z'
updatedAt: '2025-06-06T10:29:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6757'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-06T10:29:14Z'
---
# grid.column.AnimatedCurrency: cellRenderer() broken

* Regression issue
* The default scope for cell renderers switched from the column to the view instance.
* The fix is trivial, since the renderer gets the column as a nested param

## Timeline

- 2025-06-06T10:28:40Z @tobiu assigned to @tobiu
- 2025-06-06T10:28:42Z @tobiu added the `bug` label
- 2025-06-06T10:29:05Z @tobiu referenced in commit `8980a13` - "grid.column.AnimatedCurrency: cellRenderer() broken #6757"
- 2025-06-06T10:29:14Z @tobiu closed this issue

