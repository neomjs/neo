---
id: 6066
title: 'component.Base: syncVnodeTree() => register top level wrapper nodes'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-11-06T12:14:27Z'
updatedAt: '2024-11-06T12:14:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6066'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-06T12:14:56Z'
---
# component.Base: syncVnodeTree() => register top level wrapper nodes

in case a cmp is using `removeDom: true` on the top-level vdom node, no vnode exists.

we need to add a check.

## Timeline

- 2024-11-06T12:14:27Z @tobiu added the `bug` label
- 2024-11-06T12:14:28Z @tobiu assigned to @tobiu
- 2024-11-06T12:14:54Z @tobiu referenced in commit `e9cc10f` - "component.Base: syncVnodeTree() => register top level wrapper nodes #6066"
- 2024-11-06T12:14:56Z @tobiu closed this issue
- 2024-11-08T13:09:16Z @tobiu referenced in commit `f26c1dd` - "component.Base: syncVnodeTree() => register top level wrapper nodes #6066"

