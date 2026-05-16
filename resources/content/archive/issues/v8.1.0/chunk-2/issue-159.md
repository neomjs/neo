---
id: 159
title: 'controller.Component: check for parent handlers'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2019-12-06T21:50:33Z'
updatedAt: '2019-12-06T21:51:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/159'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-06T21:51:07Z'
---
# controller.Component: check for parent handlers

use case: real world app2

HeaderToolbar has buttons with string based handlers
HeaderToolbarController can have the handler methods (works)
MainContainerController (parent controller of headerToolbar) can have the handler methods (breaks)

## Timeline

- 2019-12-06T21:50:34Z @tobiu added the `enhancement` label
- 2019-12-06T21:50:34Z @tobiu assigned to @tobiu
- 2019-12-06T21:50:58Z @tobiu referenced in commit `ba189b1` - "controller.Component: check for parent handlers #159"
### @tobiu - 2019-12-06T21:51:07Z

resolved.

- 2019-12-06T21:51:07Z @tobiu closed this issue

