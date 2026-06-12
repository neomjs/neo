---
id: 5376
title: 'component.Base: notify parents about running updates'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2024-03-28T16:13:09Z'
updatedAt: '2024-09-11T02:27:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5376'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-11T02:27:03Z'
---
# component.Base: notify parents about running updates

we already have logic in place that a child component can not trigger an `update()` while a parent update is running.

however, if a child starts an update and then a parent starts an update before the new child vnode got back, we can get into trouble.

@ThorstenRaab @ki1pen 

## Timeline

- 2024-03-28T16:13:09Z @tobiu added the `enhancement` label
- 2024-03-28T16:13:10Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-28T02:24:14Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-28T02:24:14Z @github-actions added the `stale` label
### @github-actions - 2024-09-11T02:27:03Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-11T02:27:04Z @github-actions closed this issue

