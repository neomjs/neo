---
id: 2396
title: 'vdom.Helper: createDeltas() => ensure there are no move OPs to the same index'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2021-06-17T22:43:37Z'
updatedAt: '2024-09-16T02:36:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2396'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:56Z'
---
# vdom.Helper: createDeltas() => ensure there are no move OPs to the same index

this does not cause any bugs, but triggers a not needed dom OP.

```
            if (movedNode) {

                // todo: check if there is a real index change

                deltas.push({
                    action: 'moveNode',
                    id      : oldVnode.id,
                    index   : movedNode.index,
                    parentId: movedNode.parentNode.id
                });
```

## Timeline

- 2021-06-17T22:43:37Z @tobiu added the `enhancement` label
- 2021-06-17T22:43:37Z @tobiu assigned to @tobiu
### @tobiu - 2021-06-17T22:44:02Z

this should also get added to the latest calendar siesta test.

### @github-actions - 2024-09-01T02:38:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:39Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:56Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:56Z @github-actions closed this issue

