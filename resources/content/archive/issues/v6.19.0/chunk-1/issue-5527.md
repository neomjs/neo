---
id: 5527
title: 'vdom.Helper: findMovedNodes() => enhance the return value'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-04T11:51:17Z'
updatedAt: '2024-07-04T12:06:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5527'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-04T12:06:48Z'
---
# vdom.Helper: findMovedNodes() => enhance the return value

a map which contains the actual vnodes feel pointless for future move OPs.

it would be better to get the same structure which we use inside the new flat maps (parent node, index, node, parent path).

## Timeline

- 2024-07-04T11:51:17Z @tobiu added the `enhancement` label
- 2024-07-04T11:51:17Z @tobiu assigned to @tobiu
- 2024-07-04T11:52:02Z @tobiu referenced in commit `49ab695` - "vdom.Helper: findMovedNodes() => enhance the return value #5527"
- 2024-07-04T12:06:48Z @tobiu closed this issue

