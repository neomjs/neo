---
id: 1578
title: 'component.Base: getController() => recursive approach'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-25T08:53:15Z'
updatedAt: '2021-03-25T08:59:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1578'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-25T08:59:03Z'
---
# component.Base: getController() => recursive approach

`getModel()` is more advanced now, using a recursive approach instead of fetching the entire parent chain with the ComponentManager.

Adjust this method to use the same recursive approach.

## Timeline

- 2021-03-25T08:53:15Z @tobiu added the `enhancement` label
- 2021-03-25T08:53:15Z @tobiu assigned to @tobiu
- 2021-03-25T08:57:52Z @tobiu referenced in commit `74e7ebc` - "component.Base: getController() => recursive approach #1578"
- 2021-03-25T08:59:03Z @tobiu closed this issue

