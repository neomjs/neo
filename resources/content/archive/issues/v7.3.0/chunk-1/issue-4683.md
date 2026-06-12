---
id: 4683
title: 'component.Base: explore & fix inconsistencies between the mounted state & having a vnode'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-08-09T13:35:29Z'
updatedAt: '2024-09-13T02:29:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4683'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:18Z'
---
# component.Base: explore & fix inconsistencies between the mounted state & having a vnode

we can most likely simplify this a lot, in case we use the assumption: if a component has a vnode (real DOM), it has to be mounted.

then we could use `afterSetVnode()` as the single source of truth to change the value of the mounted config.


## Timeline

- 2023-08-09T13:35:29Z @tobiu added the `enhancement` label
### @tobiu - 2023-08-09T13:39:26Z

hmm, actually there is one exception: you can render a component (creating a vnode) without mounting it. but as soon as we come into the update cycle, the assumption is correct.

bigger question: do we even need render without mounting.

### @github-actions - 2024-08-29T02:26:48Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:49Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:18Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:18Z @github-actions closed this issue

