---
id: 5024
title: 'controller.Base: onHashChange() => wrong usage of `every()`'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - ThorstenRaab
createdAt: '2023-10-17T14:39:50Z'
updatedAt: '2024-09-13T02:28:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5024'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:54Z'
---
# controller.Base: onHashChange() => wrong usage of `every()`

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every

is designed to test all entries of an array with a callback fn to check if they match a given condition.

you can use `forEach()` in case you just want to iterate over all items.

if you want to iterate up to a given point and then break the loop, for of is a good fit:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of

## Timeline

- 2023-10-17T14:39:50Z @tobiu added the `bug` label
- 2023-10-17T14:39:51Z @tobiu assigned to @ThorstenRaab
- 2023-10-19T14:17:27Z @ThorstenRaab cross-referenced by PR #5043
### @github-actions - 2024-08-29T02:26:30Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:30Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:53Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:54Z @github-actions closed this issue

