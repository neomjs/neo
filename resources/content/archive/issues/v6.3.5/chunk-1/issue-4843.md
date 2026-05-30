---
id: 4843
title: 'mixin.DeltaUpdates: du_removeNode()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-05T09:14:12Z'
updatedAt: '2023-09-05T09:15:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4843'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-05T09:15:16Z'
---
# mixin.DeltaUpdates: du_removeNode()

super high prio item.

if a node is not found, the engine will try to check for vtype: 'text'. if no parentId gets passed, it will fall back to the document.body. in that case, a regex-parsing can happen there, resulting in the re-creation of ALL child nodes.

## Timeline

- 2023-09-05T09:14:12Z @tobiu added the `bug` label
- 2023-09-05T09:14:13Z @tobiu assigned to @tobiu
- 2023-09-05T09:15:13Z @tobiu referenced in commit `5ab1824` - "mixin.DeltaUpdates: du_removeNode() #4843"
- 2023-09-05T09:15:16Z @tobiu closed this issue

