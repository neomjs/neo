---
id: 4066
title: 'container.Base: removeAt() => clear context'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-02-16T21:10:17Z'
updatedAt: '2024-09-12T02:29:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4066'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:31Z'
---
# container.Base: removeAt() => clear context

@Dinkh 

in case we are removing a component from a container without destroying it, the op should clear:
* appName
* parentId
* parentIndex

Re-adding the component to a container will set the values again.

## Timeline

- 2023-02-16T21:10:17Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:27:34Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:34Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:31Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:31Z @github-actions closed this issue

