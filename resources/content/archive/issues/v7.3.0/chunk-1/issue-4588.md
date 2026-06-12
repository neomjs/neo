---
id: 4588
title: 'component.Base: allow vdom updates for sub trees'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-07-28T10:39:05Z'
updatedAt: '2024-09-13T02:29:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4588'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:27Z'
---
# component.Base: allow vdom updates for sub trees

inside components with rather big vdom structures like `table.View`, it would be nice if we can just pass a child vdom & vnode tree to the vdom worker to check for delta updates (in this specific case a table row or even cell).

the logic will need to replace the vnode at the correct spot inside the vnode tree, once the delta comparison is done.

## Timeline

- 2023-07-28T10:39:05Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:26:55Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:55Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:26Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:27Z @github-actions closed this issue

