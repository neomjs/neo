---
id: 3801
title: 'manager.Toast: updateItemsInPosition() => performance'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-06T08:16:18Z'
updatedAt: '2023-01-06T11:51:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3801'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-06T11:51:38Z'
---
# manager.Toast: updateItemsInPosition() => performance

hi torsten,

you are using an async function (await) inside a for loop. this is similar to waiting for ajax calls one by one before triggering the next call.

i recommend to use `Promise.all()` instead.

similar example: https://github.com/neomjs/neo/blob/dev/src/Main.mjs#L226

## Timeline

- 2023-01-06T08:16:18Z @tobiu added the `enhancement` label
- 2023-01-06T08:16:18Z @tobiu assigned to @Dinkh
- 2023-01-06T11:48:15Z @tobiu unassigned from @Dinkh
- 2023-01-06T11:48:16Z @tobiu assigned to @tobiu
- 2023-01-06T11:48:32Z @tobiu referenced in commit `5a2f6fd` - "manager.Toast: updateItemsInPosition() => performance #3801"
- 2023-01-06T11:51:38Z @tobiu closed this issue

