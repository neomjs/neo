---
id: 5050
title: 'container.Base: object based items'
state: CLOSED
labels:
  - enhancement
  - discussion
  - stale
assignees: []
createdAt: '2023-10-23T13:10:55Z'
updatedAt: '2024-09-13T02:28:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5050'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:49Z'
---
# container.Base: object based items

@ExtAnimal's approach to optionally use objects is charming, since we can enhance configurations via deep merges => only changing the parts we like to.

Current limitations: `afterSetItems()` will transform the object into the old array based structure right away.
1. We can only statically enhance item objects.
2. We are losing the original definition on instance level (well, we can still look at it inside the originalConfig / prototype)
3. We can not use other `afterSet()` hooks to further enhance / change object based item definitions
4. It might not be clear for devs, that the hooks will already always get the items array

One strategy to keep the API consistent would be to use a new config like `itemsObject`. `afterSetItemsObject()` could do the transformation and store the result inside the real `items` config. This way, we could change the `itemsObject` at run-time. However, the transformation logic needs to be smart. Regenerating the array is not expensive, but re-creating existing item instances must not happen (this can become very expensive).

Thoughts?

## Timeline

- 2023-10-23T13:10:55Z @tobiu added the `enhancement` label
- 2023-10-23T13:10:55Z @tobiu added the `discussion` label
### @github-actions - 2024-08-29T02:26:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:27Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:49Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:49Z @github-actions closed this issue

