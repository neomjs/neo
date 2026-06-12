---
id: 6104
title: 'component.Base: needsParentUpdate() => adjust for v8'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-11T16:30:42Z'
updatedAt: '2024-11-11T17:19:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6104'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-11T17:19:29Z'
---
# component.Base: needsParentUpdate() => adjust for v8

Similar to `isParentVdomUpdating()` the method needs to honor the `updateDepth` of the parent, as well as the distance to it.

## Timeline

- 2024-11-11T16:30:42Z @tobiu added the `enhancement` label
- 2024-11-11T16:30:43Z @tobiu assigned to @tobiu
- 2024-11-11T17:19:20Z @tobiu referenced in commit `badbb75` - "component.Base: needsParentUpdate() => adjust for v8 #6104"
- 2024-11-11T17:19:29Z @tobiu closed this issue

