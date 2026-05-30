---
id: 4542
title: model.Component with a store & listeners throws a JS error
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-07-12T12:31:23Z'
updatedAt: '2024-09-13T02:29:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4542'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:40Z'
---
# model.Component with a store & listeners throws a JS error

we just encountered this inside our neo training:
a view model has a stores config with a custom store which has an url, autoLoad. adding listeners like
`listeners: {load: items => console.log(items)}` did not work.

we should create a small example and debug it.

## Timeline

- 2023-07-12T12:31:23Z @tobiu added the `bug` label
### @github-actions - 2024-08-29T02:27:05Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:05Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:40Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:40Z @github-actions closed this issue

