---
id: 1123
title: 'vdom.Helper: update() => performance'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2020-08-21T18:53:01Z'
updatedAt: '2024-09-27T02:34:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1123'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:20Z'
---
# vdom.Helper: update() => performance

I think we can further increase the performance, in case we add a map for the new & old vnode trees.

object keys with the structure:

ìd: {vnode, parentId, parentIndex, parentVnode}

(parentId is a bit redundant (same as parentVnode.id)).

This way we would ensure, that vnode trees only get recursively parsed 3 times

1. creating the map: new tree
2. creating the map: old tree
3. dynamically parsing the new tree

right now, there are additional sub tree parsings in place (to find moved nodes).

## Timeline

- 2020-08-21T18:53:01Z @tobiu added the `enhancement` label
- 2020-08-21T18:53:01Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-13T02:31:08Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:20Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:20Z @github-actions closed this issue

