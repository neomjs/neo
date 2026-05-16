---
id: 1505
title: 'SharedDialog.view.MainContainerController: onDragMove() => dialog rect'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-02-02T13:05:54Z'
updatedAt: '2021-03-17T12:34:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1505'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-17T12:34:23Z'
---
# SharedDialog.view.MainContainerController: onDragMove() => dialog rect

we need to store the dialog rect inside onDragStart() and use it inside onDragMove()

(the drag proxy rect is just the header toolbar of the dialog, but we want to check the entire dialog box)

## Timeline

- 2021-02-02T13:05:54Z @tobiu added the `enhancement` label
- 2021-02-02T13:05:54Z @tobiu assigned to @tobiu
### @tobiu - 2021-03-17T12:34:23Z

already resolved.

- 2021-03-17T12:34:23Z @tobiu closed this issue

