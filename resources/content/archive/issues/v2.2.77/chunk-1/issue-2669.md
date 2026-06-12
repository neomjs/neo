---
id: 2669
title: 'main.draggable.sensor.Mouse: onMouseDown() => event.path'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-08-02T00:34:41Z'
updatedAt: '2021-08-02T00:37:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2669'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-08-02T00:37:56Z'
---
# main.draggable.sensor.Mouse: onMouseDown() => event.path

I just noticed inside Safari Tech Preview, that `event.composedPath()` only works in case we are calling it inside the handler.

When storing the event as the `startEvent` and later calling `composedPath()`, we get an empty array.

To fix this, I will store the path manually inside `onMouseDown()`.

Assuming that it is the same for touch events, I will adjust the touch sensor as well.

## Timeline

- 2021-08-02T00:34:41Z @tobiu added the `bug` label
- 2021-08-02T00:34:42Z @tobiu assigned to @tobiu
### @tobiu - 2021-08-02T00:36:53Z

This one affects the non tech preview version of safari as well.

- 2021-08-02T00:37:31Z @tobiu referenced in commit `f26d7a3` - "main.draggable.sensor.Mouse: onMouseDown() => event.path #2669"
- 2021-08-02T00:37:56Z @tobiu closed this issue

