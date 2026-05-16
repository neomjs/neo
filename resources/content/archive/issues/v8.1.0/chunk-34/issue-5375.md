---
id: 5375
title: 'collection.Base: destroy() => edge case, can get called more than once with VM based stores which get bound in multiple cmps.'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-28T09:56:37Z'
updatedAt: '2024-03-28T13:57:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5375'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-28T13:57:24Z'
---
# collection.Base: destroy() => edge case, can get called more than once with VM based stores which get bound in multiple cmps.

i think `core.Base: destroy()` should set a flag like `isDestroyed`.

then all class extensions should check for this flag, before doing their logic.

thoughts? @ExtAnimal 

## Timeline

- 2024-03-28T09:56:38Z @tobiu added the `enhancement` label
- 2024-03-28T09:56:38Z @tobiu assigned to @tobiu
- 2024-03-28T13:57:17Z @tobiu referenced in commit `7b515ab` - "collection.Base: destroy() => edge case, can get called more than once with VM based stores which get bound in multiple cmps. #5375"
- 2024-03-28T13:57:24Z @tobiu closed this issue
- 2024-03-28T15:07:36Z @tobiu referenced in commit `d218dbf` - "#5375 added a comment to explain why we are using an interceptor here"

