---
id: 3542
title: 'data.Model: fields should support arrays inside mapping'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-10-20T16:30:15Z'
updatedAt: '2024-09-14T02:26:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3542'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:49Z'
---
# data.Model: fields should support arrays inside mapping

sometimes APIs use weird formatting, like `link[1].attributes.href`

https://itunes.apple.com/us/rss/topmusicvideos/limit=5/json

we can not use `Neo.ns()` in this case and need a smarter algorithm.

## Timeline

- 2022-10-20T16:30:15Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-30T02:27:45Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:45Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:49Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:49Z @github-actions closed this issue

