---
id: 4685
title: 'component.Base: updateVdom() should become the single source of truth'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-09T16:08:27Z'
updatedAt: '2023-08-09T19:58:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4685'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-09T19:58:19Z'
---
# component.Base: updateVdom() should become the single source of truth

meaning `afterSetVdom()` should just call it and all gatekeepers need to end up inside `updateVdom()`.

this ensure a consistent behavior for `promiseVdomUpdate()`.

long overdue, but needs testing.

## Timeline

- 2023-08-09T16:08:27Z @tobiu added the `enhancement` label
- 2023-08-09T16:08:28Z @tobiu assigned to @tobiu
- 2023-08-09T19:56:28Z @tobiu referenced in commit `08cccf5` - "component.Base: updateVdom() should become the single source of truth #4685"
- 2023-08-09T19:58:20Z @tobiu closed this issue

