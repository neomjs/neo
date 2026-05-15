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
blockedBy: []
blocking: []
closedAt: '2025-06-15T11:26:33Z'
---
# vdom.VNode: wrong attributes type

* The class was always used with `vnode.attributes` being an Object.
* However, the documentation and ctor use it as an Array, which is misleading.
* While it did not break anything, I want to change it for clarity.

## Timeline

- 2025-06-15T11:26:04Z @tobiu assigned to @tobiu
- 2025-06-15T11:26:05Z @tobiu added the `bug` label
- 2025-06-15T11:26:24Z @tobiu referenced in commit `2cd0d20` - "vdom.VNode: wrong attributes type #6796"
- 2025-06-15T11:26:34Z @tobiu closed this issue

