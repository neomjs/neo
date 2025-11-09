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
closedAt: '2025-07-22T19:30:40Z'
---
# util.vdom.TreeBuilder: #buildTree()

**Reported by:** @tobiu on 2025-07-22

* Keep it DRY.
* Make the intent more clear: showcasing that we want to aggregate `vdom` & `vnode` trees in the same way.

## Comments

### @tobiu - 2025-07-22 19:30

we are facing an edge case, only inside the unit testing realm.

the combined logic contained the `if (!Neo.isObject(node) {return node}` check also for `vnodes`, which was previously only there for `vdom`.

inside the unit testing scope, we import `vdom.Helper` into main threads, so `vnodes` are no longer objects, and the new method opted out right away.

