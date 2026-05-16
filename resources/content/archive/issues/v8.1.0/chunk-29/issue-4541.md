---
id: 4541
title: 'table.Container: beforeSetStore() => listeners'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-07-12T12:29:07Z'
updatedAt: '2024-09-13T02:29:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4541'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:41Z'
---
# table.Container: beforeSetStore() => listeners

we should add an `afterSetStore()` method which dynamically assigns the listeners via `on()`.

otherwise, in case devs specify their own listeners, they will get overridden. 

## Timeline

- 2023-07-12T12:29:07Z @tobiu added the `enhancement` label
- 2023-07-12T12:29:07Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:27:06Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:06Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:41Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:42Z @github-actions closed this issue

