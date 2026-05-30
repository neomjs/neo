---
id: 3304
title: 'controller.Base: move the first onHashChange from ctor to onConstructed()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-07-20T06:59:51Z'
updatedAt: '2022-07-20T07:29:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3304'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-20T07:29:23Z'
---
# controller.Base: move the first onHashChange from ctor to onConstructed()

the timing inside the ctor can be too early => before the `controller.Component` ctor is done and `this.references` are registered.

## Timeline

- 2022-07-20T06:59:51Z @tobiu added the `bug` label
- 2022-07-20T06:59:51Z @tobiu assigned to @tobiu
- 2022-07-20T07:00:14Z @tobiu referenced in commit `c7b6dcc` - "controller.Base: move the first onHashChange from ctor to onConstructed() #3304"
- 2022-07-20T07:29:23Z @tobiu closed this issue

