---
id: 2271
title: 'draggable.calendar.WeekEventDragZone: dragMove() => minimum event duration on resize'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-06-05T13:34:27Z'
updatedAt: '2021-06-05T20:49:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2271'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-05T20:49:02Z'
---
# draggable.calendar.WeekEventDragZone: dragMove() => minimum event duration on resize

this one works fine, in case an event starts at a full hour.

if an event starts at e.g. 9:15, 9:30 or 9:45 the minimum values are not correct.

looks like the event start minutes are getting ignored.

will look into this.

## Timeline

- 2021-06-05T13:34:27Z @tobiu added the `bug` label
- 2021-06-05T13:34:27Z @tobiu assigned to @tobiu
- 2021-06-05T20:48:50Z @tobiu referenced in commit `f801380` - "draggable.calendar.WeekEventDragZone: dragMove() => minimum event duration on resize #2271"
- 2021-06-05T20:49:02Z @tobiu closed this issue

