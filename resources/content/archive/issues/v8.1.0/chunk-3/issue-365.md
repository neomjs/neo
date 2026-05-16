---
id: 365
title: 'Covid.view.MainContainerController: onHashChange() refactoring'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2020-03-24T19:35:32Z'
updatedAt: '2024-09-28T02:31:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/365'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:57Z'
---
# Covid.view.MainContainerController: onHashChange() refactoring

there is a check in place if data got loaded and if not use a setTimeout() call.

this was just a quick hack.

onHashChange needs to store the params of its last call inside the class.

in case the api is loading or there is no data available => do nothing.

instead, when data got loaded, trigger onHashChange afterwards. Best with a 50-100ms delay to ensure the data got mounted into the real dom already.

## Timeline

- 2020-03-24T19:35:32Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-14T02:27:44Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:44Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:56Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:57Z @github-actions closed this issue

