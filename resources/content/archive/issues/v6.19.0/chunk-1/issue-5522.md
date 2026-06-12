---
id: 5522
title: 'vdom.Helper: createVnodeMap() => add the parent id path for each map item'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-03T20:46:44Z'
updatedAt: '2024-07-03T20:47:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5522'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-03T20:47:34Z'
---
# vdom.Helper: createVnodeMap() => add the parent id path for each map item

Then we can easily check if a specific node is the child of another node:
```
node.parentPath.includes(potentialParentNodeId)
```

## Timeline

- 2024-07-03T20:46:44Z @tobiu added the `enhancement` label
- 2024-07-03T20:46:44Z @tobiu assigned to @tobiu
- 2024-07-03T20:47:31Z @tobiu referenced in commit `34f01e9` - "vdom.Helper: createVnodeMap() => add the parent id path for each map item #5522"
- 2024-07-03T20:47:34Z @tobiu closed this issue

