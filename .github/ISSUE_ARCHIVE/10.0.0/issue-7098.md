---
id: 7098
title: 'util.vdom.TreeBuilder: #buildTree()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-22T15:22:04Z'
updatedAt: '2025-07-22T19:30:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7098'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-22T19:30:40Z'
---
# util.vdom.TreeBuilder: #buildTree()

* Keep it DRY.
* Make the intent more clear: showcasing that we want to aggregate `vdom` & `vnode` trees in the same way.

## Comments

### @tobiu - 2025-07-22 19:30

we are facing an edge case, only inside the unit testing realm.

the combined logic contained the `if (!Neo.isObject(node) {return node}` check also for `vnodes`, which was previously only there for `vdom`.

inside the unit testing scope, we import `vdom.Helper` into main threads, so `vnodes` are no longer objects, and the new method opted out right away.

## Activity Log

- 2025-07-22 @tobiu assigned to @tobiu
- 2025-07-22 @tobiu added the `enhancement` label
- 2025-07-22 @tobiu referenced in commit `8d36325` - "util.vdom.TreeBuilder: #buildTree() #7098"
- 2025-07-22 @tobiu closed this issue
- 2025-07-22 @tobiu referenced in commit `112400c` - "util.vdom.TreeBuilder: #buildTree() #7098"
- 2025-07-22 @tobiu closed this issue

