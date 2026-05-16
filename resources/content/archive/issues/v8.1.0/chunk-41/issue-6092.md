---
id: 6092
title: 'vdom.Helper: isMovedNode()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-08T14:25:57Z'
updatedAt: '2024-11-08T14:28:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6092'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-08T14:28:47Z'
---
# vdom.Helper: isMovedNode()

We need to enhance the logic a little bit for v8:
* a container update with a depth of 1 will include reference items for the new & old tree => move OP
* if a new node has a real tree & the old node a reference => insert

## Timeline

- 2024-11-08T14:25:57Z @tobiu added the `enhancement` label
- 2024-11-08T14:25:57Z @tobiu assigned to @tobiu
- 2024-11-08T14:28:31Z @tobiu referenced in commit `c96a16f` - "vdom.Helper: isMovedNode() #6092"
- 2024-11-08T14:28:47Z @tobiu closed this issue

