---
id: 3105
title: 'controller.Component: removeReference() => the call should bubble upwards'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-05-27T12:48:13Z'
updatedAt: '2022-05-27T12:50:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3105'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-27T12:50:56Z'
---
# controller.Component: removeReference() => the call should bubble upwards

since we can access references from parent controllers, we should clear the cached value inside the entire parent-controller chain.

## Timeline

- 2022-05-27T12:48:13Z @tobiu added the `enhancement` label
- 2022-05-27T12:48:14Z @tobiu assigned to @tobiu
- 2022-05-27T12:48:42Z @tobiu referenced in commit `7e8efa0` - "controller.Component: removeReference() => the call should bubble upwards #3105"
- 2022-05-27T12:50:57Z @tobiu closed this issue

