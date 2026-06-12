---
id: 3130
title: Object.hasOwn()
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2022-06-07T09:28:28Z'
updatedAt: '2024-09-15T02:35:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3130'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:54Z'
---
# Object.hasOwn()

I kind of missed this one :)

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn

we can now replace all occurrences of `Object.hasOwnProperty()` with `hasOwn()`.

MDN recommends to do so, the bundle sizes get a bit smaller and the browser and nodejs support is decent.

## Timeline

- 2022-06-07T09:28:28Z @tobiu added the `enhancement` label
- 2022-06-07T09:28:29Z @tobiu assigned to @tobiu
### @tobiu - 2022-06-07T09:31:37Z

well, actually it is not true for the bundle size, since we can call `hasOwnProperty()` directly on objects, while `hasOwn()` has to get called on `Object`. still, we should do it.

### @github-actions - 2024-08-31T02:25:54Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:54Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:54Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:54Z @github-actions closed this issue

