---
id: 1080
title: 'calendar.draggable.WeekEventDragZone: dragStart without moving'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-08-15T11:42:55Z'
updatedAt: '2020-08-15T11:49:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1080'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T11:49:20Z'
---
# calendar.draggable.WeekEventDragZone: dragStart without moving

just noticed, that in case you click longer than the drag start delay on an event without moving the mouse, it moves to the top of the screen.

there is some required logic inside drag:move.

either we trigger a dummy mouseMove on drag:start or we need to copy the relevant logic directly into drag:start.

## Timeline

- 2020-08-15T11:42:55Z @tobiu added the `bug` label
- 2020-08-15T11:42:55Z @tobiu assigned to @tobiu
- 2020-08-15T11:49:04Z @tobiu referenced in commit `0f972cf` - "calendar.draggable.WeekEventDragZone: dragStart without moving #1080"
### @tobiu - 2020-08-15T11:49:20Z

works fine with an initial fake drag:move.

- 2020-08-15T11:49:20Z @tobiu closed this issue

