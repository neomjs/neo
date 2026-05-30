---
id: 3903
title: 'controller.Base: examine why the observable mixin is included'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-01-18T21:23:03Z'
updatedAt: '2023-01-18T21:34:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3903'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-18T21:34:58Z'
---
# controller.Base: examine why the observable mixin is included

Can't remember anymore why the mixin got there. At a first glance, especially view controllers should only fire events on views.

An application instance (which does extend `controller.Base`) might need it, but this child class could include the mixin on its own.

## Timeline

- 2023-01-18T21:23:03Z @tobiu added the `enhancement` label
- 2023-01-18T21:34:21Z @tobiu referenced in commit `ca98e3f` - "controller.Base: examine why the observable mixin is included #3903"
### @tobiu - 2023-01-18T21:34:58Z

just moved the mixin to app. we could revert it, in case there are reasons which make sense.

- 2023-01-18T21:34:59Z @tobiu closed this issue

