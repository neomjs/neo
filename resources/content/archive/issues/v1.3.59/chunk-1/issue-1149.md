---
id: 1149
title: 'plugin.Resizable: add a mouse cursor rule to the doc body'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-29T21:30:43Z'
updatedAt: '2020-08-31T15:03:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1149'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-31T15:03:16Z'
---
# plugin.Resizable: add a mouse cursor rule to the doc body

the resize grab handle is very small. since the cursor is not sticky to the element while dragging, it jumps from cursor: pointer to the resize cursor back & forth.

on drag:start => add a resize cursor to the doc.body with !important and remove it on drag:end.

## Timeline

- 2020-08-29T21:30:43Z @tobiu added the `enhancement` label
- 2020-08-29T21:30:43Z @tobiu assigned to @tobiu
- 2020-08-29T22:24:53Z @tobiu referenced in commit `0c44840` - "plugin.Resizable: add a mouse cursor rule to the doc body #1149 (in progress)"
- 2020-08-31T15:03:12Z @tobiu referenced in commit `62b1e7a` - "plugin.Resizable: add a mouse cursor rule to the doc body #1149"
- 2020-08-31T15:03:16Z @tobiu closed this issue

