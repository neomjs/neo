---
id: 6796
title: 'vdom.VNode: wrong attributes type'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-06-15T11:26:04Z'
updatedAt: '2025-06-15T11:26:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6796'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-15T11:26:33Z'
---
# vdom.VNode: wrong attributes type

**Reported by:** @tobiu on 2025-06-15

* The class was always used with `vnode.attributes` being an Object.
* However, the documentation and ctor use it as an Array, which is misleading.
* While it did not break anything, I want to change it for clarity.

