---
id: 5393
title: 'core.Base: destroy() => set fire() to an emptyFn, in case the instance is observable'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-15T10:48:32Z'
updatedAt: '2024-04-15T10:51:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5393'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-15T10:51:22Z'
---
# core.Base: destroy() => set fire() to an emptyFn, in case the instance is observable

we do want to prevent delayed event calls after an instance got destroyed.

## Timeline

- 2024-04-15T10:48:32Z @tobiu added the `enhancement` label
- 2024-04-15T10:48:32Z @tobiu assigned to @tobiu
- 2024-04-15T10:51:06Z @tobiu referenced in commit `e0b84a5` - "core.Base: destroy() => set fire() to an emptyFn, in case the instance is observable #5393"
- 2024-04-15T10:51:22Z @tobiu closed this issue

