---
id: 1058
title: 'calendar.draggable.WeekEventDragZone: scroll inside the view when dragging over an edge'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-14T10:03:06Z'
updatedAt: '2020-08-14T20:47:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1058'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-14T20:47:15Z'
---
# calendar.draggable.WeekEventDragZone: scroll inside the view when dragging over an edge

this needs to trigger the infinite scrolling.

idea: we could add a non visible 2nd dragProxy (position: absolute) which will trigger the default scrolling.

we could add a scroll listener to figure out when we drag over an edge to trigger the infinite scrolling.

## Timeline

- 2020-08-14T10:03:06Z @tobiu added the `enhancement` label
- 2020-08-14T10:03:07Z @tobiu assigned to @tobiu
### @tobiu - 2020-08-14T20:47:15Z

had to implement the scroll logic manually.

- 2020-08-14T20:47:15Z @tobiu closed this issue

