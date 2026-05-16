---
id: 6049
title: 'container.Base: insert() => updateDepth -1'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-05T13:30:30Z'
updatedAt: '2024-11-05T13:44:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6049'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-05T13:30:57Z'
---
# container.Base: insert() => updateDepth -1

in case we are adding / inserting new items into a container, we should pass the full vdom tree into the next update cycle.

## Timeline

- 2024-11-05T13:30:30Z @tobiu added the `enhancement` label
- 2024-11-05T13:30:51Z @tobiu referenced in commit `4c34ac6` - "container.Base: insert() => updateDepth -1 #6049"
- 2024-11-05T13:30:57Z @tobiu closed this issue
- 2024-11-05T13:44:17Z @tobiu assigned to @tobiu
- 2024-11-08T13:09:14Z @tobiu referenced in commit `a93cd9b` - "container.Base: insert() => updateDepth -1 #6049"

