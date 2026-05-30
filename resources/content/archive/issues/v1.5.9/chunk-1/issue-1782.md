---
id: 1782
title: 'controller.Application: create the mainView after the ctor is done'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-15T09:24:30Z'
updatedAt: '2021-04-15T09:29:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1782'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-15T09:29:41Z'
---
# controller.Application: create the mainView after the ctor is done

this part was actually nicer in the first version.

we can not use `this` inside the ctor before the `super()` call, but we can delay the mainView assignment easily.

this change guarantees that the main view can access `Neo.apps` at any point

## Timeline

- 2021-04-15T09:24:30Z @tobiu added the `enhancement` label
- 2021-04-15T09:24:30Z @tobiu assigned to @tobiu
- 2021-04-15T09:24:52Z @tobiu referenced in commit `06653d0` - "controller.Application: create the mainView after the ctor is done #1782"
- 2021-04-15T09:29:41Z @tobiu closed this issue

