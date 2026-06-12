---
id: 1068
title: 'calendar.draggable.WeekEventDragZone: dragMove() => do not use the vdom engine'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-14T20:48:31Z'
updatedAt: '2020-08-15T09:37:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1068'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T09:37:08Z'
---
# calendar.draggable.WeekEventDragZone: dragMove() => do not use the vdom engine

we know exactly what will change on the proxyEl.

=> manually create the deltas & send them to main instead.

## Timeline

- 2020-08-14T20:48:31Z @tobiu added the `enhancement` label
- 2020-08-14T20:52:15Z @tobiu assigned to @tobiu
- 2020-08-15T09:37:03Z @tobiu referenced in commit `8bae05d` - "calendar.draggable.WeekEventDragZone: dragMove() => do not use the vdom engine #1068"
- 2020-08-15T09:37:08Z @tobiu closed this issue

