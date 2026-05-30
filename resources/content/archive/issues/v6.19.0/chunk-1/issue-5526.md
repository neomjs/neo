---
id: 5526
title: 'vdom.Helper: insertNode()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-04T10:50:06Z'
updatedAt: '2024-07-04T13:09:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5526'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-04T13:09:00Z'
---
# vdom.Helper: insertNode()

let us move the logic outside of `createDeltas()` to implement the new logic for inserting new nodes which contain moved nodes at a central spot.

## Timeline

- 2024-07-04T10:50:06Z @tobiu added the `enhancement` label
- 2024-07-04T10:50:06Z @tobiu assigned to @tobiu
- 2024-07-04T10:50:37Z @tobiu referenced in commit `5eb5c70` - "vdom.Helper: insertNode() #5526 WIP"
- 2024-07-04T10:54:43Z @tobiu referenced in commit `ea0c3ac` - "#5526 vdom.Helper: insertNode() => passing the index inside the PoC call"
- 2024-07-04T12:08:57Z @tobiu referenced in commit `dd8106c` - "#5526 vdom.Helper:
new node generation now skips moved nodes

1. insertNode() => pass movedNodes to createStringFromVnode()
2. createStringFromVnode() => pass movedNodes to createTagContent()"
- 2024-07-04T12:16:26Z @tobiu referenced in commit `44c45e8` - "#5526 vdom.Helper: insertNode() => create the move OP deltas"
- 2024-07-04T12:29:02Z @tobiu referenced in commit `de28133` - "#5526 vdom.Helper: createDeltas() => wrapped node removements are no longer required"
- 2024-07-04T13:03:28Z @tobiu referenced in commit `10b8fc4` - "#5526 vdom.Helper: insertNode() => using the logic in all spots"
- 2024-07-04T13:09:00Z @tobiu closed this issue

