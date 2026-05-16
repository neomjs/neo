---
id: 6072
title: 'component.Base: executeVdomUpdate() => reset update depth to the proto value'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-06T14:19:53Z'
updatedAt: '2024-11-06T14:20:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6072'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-06T14:20:23Z'
---
# component.Base: executeVdomUpdate() => reset update depth to the proto value

setting the `updateDepth` to 1 was just a hack, since class extensions of component.Base can set different default values.

we need to honor them.

## Timeline

- 2024-11-06T14:19:53Z @tobiu added the `enhancement` label
- 2024-11-06T14:19:53Z @tobiu assigned to @tobiu
- 2024-11-06T14:20:20Z @tobiu referenced in commit `641cf8f` - "component.Base: executeVdomUpdate() => reset update depth to the proto value #6072"
- 2024-11-06T14:20:24Z @tobiu closed this issue
- 2024-11-08T13:09:16Z @tobiu referenced in commit `4733e6f` - "component.Base: executeVdomUpdate() => reset update depth to the proto value #6072"

