---
id: 6048
title: 'component.Base: updateDepth_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-05T12:42:38Z'
updatedAt: '2024-11-05T13:44:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6048'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-05T13:22:29Z'
---
# component.Base: updateDepth_ config

especially for container layout updates, we need to include direct children.

the new config should default to 1 (current level only). bigger numbers should also send the child components vdom to the vdom worker.

a value of -1 should send the full tree

## Timeline

- 2024-11-05T12:42:38Z @tobiu added the `enhancement` label
- 2024-11-05T13:22:21Z @tobiu referenced in commit `0727708` - "component.Base: updateDepth_ config #6048"
- 2024-11-05T13:22:29Z @tobiu closed this issue
- 2024-11-05T13:44:11Z @tobiu assigned to @tobiu
- 2024-11-08T13:09:14Z @tobiu referenced in commit `232b1b7` - "component.Base: updateDepth_ config #6048"

