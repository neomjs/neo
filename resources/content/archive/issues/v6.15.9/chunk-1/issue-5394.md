---
id: 5394
title: 'component.Base: destroy() => set onFocusLeave() & unmount() to Neo.emptyFn'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-15T10:53:33Z'
updatedAt: '2024-04-15T10:55:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5394'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-15T10:55:45Z'
---
# component.Base: destroy() => set onFocusLeave() & unmount() to Neo.emptyFn

We do want to prevent delayed calls of `onFocusLeave()` and `unmount()`, after a component instance got destroyed.

## Timeline

- 2024-04-15T10:53:33Z @tobiu added the `enhancement` label
- 2024-04-15T10:53:34Z @tobiu assigned to @tobiu
- 2024-04-15T10:55:10Z @tobiu referenced in commit `7c12da9` - "component.Base: destroy() => set onFocusLeave() & unmount() to Neo.emptyFn #5394"
- 2024-04-15T10:55:45Z @tobiu closed this issue

