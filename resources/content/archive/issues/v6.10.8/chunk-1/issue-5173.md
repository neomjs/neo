---
id: 5173
title: 'controller.Base: onConstructed() must not call onHashChange()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-12-13T16:49:19Z'
updatedAt: '2023-12-13T16:49:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5173'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-13T16:49:57Z'
---
# controller.Base: onConstructed() must not call onHashChange()

this already happens inside `controller.Application` and will lead to firing the event twice plus too early.

## Timeline

- 2023-12-13T16:49:19Z @tobiu added the `bug` label
- 2023-12-13T16:49:19Z @tobiu assigned to @tobiu
- 2023-12-13T16:49:49Z @tobiu referenced in commit `4355d69` - "controller.Base: onConstructed() must not call onHashChange() #5173"
- 2023-12-13T16:49:57Z @tobiu closed this issue

