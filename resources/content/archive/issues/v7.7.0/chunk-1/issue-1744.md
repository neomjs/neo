---
id: 1744
title: 'table.Container: beforeSetStore() => passing a store instance => listeners'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2021-04-09T19:52:48Z'
updatedAt: '2024-09-18T02:28:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1744'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-18T02:28:41Z'
---
# table.Container: beforeSetStore() => passing a store instance => listeners

not sure if this one is a reasonable use case:

you could set a store, then switch to another store, then switch back to the first store.

in this case we would need a check if the listeners are already applied and only add them in case they are not.

## Timeline

- 2021-04-09T19:52:48Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-03T02:27:00Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-03T02:27:00Z @github-actions added the `stale` label
### @github-actions - 2024-09-18T02:28:41Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-18T02:28:42Z @github-actions closed this issue

