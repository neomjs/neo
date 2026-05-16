---
id: 4700
title: 'component.Base: needsParentUpdate() => add all the resolvers of a client cmp'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-11T12:40:42Z'
updatedAt: '2023-08-11T13:00:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4700'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-11T13:00:28Z'
---
# component.Base: needsParentUpdate() => add all the resolvers of a client cmp

Clearly an edge case, but the following comes to mind:

- A Component gets an `promiseUpdate()` call while it is updating.
- It stores `resolve` inside its own cache
- Once the update cycle is done, it tries to run the next cycle, but a parent is already scheduled
- So, passing the cached resolve fn(s) to the parent cache seems logic

## Timeline

- 2023-08-11T12:40:42Z @tobiu added the `enhancement` label
- 2023-08-11T12:40:42Z @tobiu assigned to @tobiu
- 2023-08-11T13:00:21Z @tobiu referenced in commit `c8d58ab` - "component.Base: needsParentUpdate() => add all the resolvers of a client cmp #4700"
- 2023-08-11T13:00:28Z @tobiu closed this issue

