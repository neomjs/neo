---
id: 6061
title: 'manager.Component: getVdomTree(), getVnodeTree() => depth'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-11-05T22:41:25Z'
updatedAt: '2024-11-05T22:44:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6061'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-05T22:44:49Z'
---
# manager.Component: getVdomTree(), getVnodeTree() => depth

the new implementation needs to change => instead of adjusting the depth on child node levels, it needs to adjust depending on component replacements inside a path.

## Timeline

- 2024-11-05T22:41:25Z @tobiu added the `bug` label
- 2024-11-05T22:41:25Z @tobiu assigned to @tobiu
- 2024-11-05T22:41:50Z @tobiu referenced in commit `33db314` - "manager.Component: getVdomTree(), getVnodeTree() => depth #6061"
- 2024-11-05T22:44:49Z @tobiu closed this issue
- 2024-11-08T13:09:15Z @tobiu referenced in commit `e0326d7` - "manager.Component: getVdomTree(), getVnodeTree() => depth #6061"

