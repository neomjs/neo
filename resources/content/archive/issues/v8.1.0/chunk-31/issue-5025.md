---
id: 5025
title: 'controller.Base: routes => routes_'
state: CLOSED
labels:
  - enhancement
assignees:
  - ThorstenRaab
createdAt: '2023-10-17T14:44:28Z'
updatedAt: '2023-12-05T11:10:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5025'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-05T11:10:37Z'
---
# controller.Base: routes => routes_

it should be possible to add new routes / change routes at runtime.

so, instead of parsing the `routes` config inside construct(), we should use `afterSetRoutes()` to handle it dynamically.

## Timeline

- 2023-10-17T14:44:28Z @tobiu added the `enhancement` label
- 2023-10-17T14:44:28Z @tobiu assigned to @ThorstenRaab
- 2023-10-19T14:17:27Z @ThorstenRaab cross-referenced by PR #5043
- 2023-12-05T11:10:37Z @tobiu closed this issue

