---
id: 3977
title: RealWorld.view.MainContainerController needs to be observable
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-02T18:19:42Z'
updatedAt: '2023-02-02T18:20:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3977'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-02T18:20:46Z'
---
# RealWorld.view.MainContainerController needs to be observable

We changed the default behavior of view controllers, making them non-observable by default. This file is a rare exception and has to be observable.

Related to: https://github.com/neomjs/neomjs-realworld-example-app/issues/5

## Timeline

- 2023-02-02T18:19:42Z @tobiu added the `bug` label
- 2023-02-02T18:19:43Z @tobiu assigned to @tobiu
- 2023-02-02T18:20:41Z @tobiu referenced in commit `68639a4` - "RealWorld.view.MainContainerController needs to be observable #3977"
- 2023-02-02T18:20:46Z @tobiu closed this issue

