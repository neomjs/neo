---
id: 6540
title: 'grid.column.Component: component parentId'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-03T23:17:59Z'
updatedAt: '2025-03-03T23:57:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6540'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-03T23:57:57Z'
---
# grid.column.Component: component parentId

* Important for connection to view controllers or state providers, if needed.

## Timeline

- 2025-03-03T23:17:59Z @tobiu added the `enhancement` label
- 2025-03-03T23:18:26Z @tobiu referenced in commit `7b70638` - "grid.column.Component: component parentId #6540"
- 2025-03-03T23:18:37Z @tobiu closed this issue
### @tobiu - 2025-03-03T23:57:32Z

For this specific use case, passing ´parentComponent´ instead makes more sense:
Inside the bigData demo, the button ripple effect will get affected when clicking very fast otherwise.

- 2025-03-03T23:57:32Z @tobiu reopened this issue
- 2025-03-03T23:57:53Z @tobiu referenced in commit `e0ef85b` - "grid.column.Component: component parentId #6540 => parentComponent"
- 2025-03-03T23:57:57Z @tobiu closed this issue

