---
id: 6073
title: 'vdom.Helper: createVnode() => do not create vnode instances for component reference objects'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-07T09:21:06Z'
updatedAt: '2024-11-07T09:21:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6073'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-07T09:21:39Z'
---
# vdom.Helper: createVnode() => do not create vnode instances for component reference objects

this might eventually change again, in case references should support more infos like `cls` => e.g. layouts getting applied to the container level.

for now we can reduce the footprint though.

## Timeline

- 2024-11-07T09:21:06Z @tobiu added the `enhancement` label
- 2024-11-07T09:21:07Z @tobiu assigned to @tobiu
- 2024-11-07T09:21:36Z @tobiu referenced in commit `39d3b6e` - "vdom.Helper: createVnode() => do not create vnode instances for component reference objects #6073"
- 2024-11-07T09:21:39Z @tobiu closed this issue
- 2024-11-08T13:09:17Z @tobiu referenced in commit `d54f4c6` - "vdom.Helper: createVnode() => do not create vnode instances for component reference objects #6073"

