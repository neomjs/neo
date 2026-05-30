---
id: 2614
title: 'calendar.view.week.Component: getEventDragZone()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-17T12:28:57Z'
updatedAt: '2021-07-17T12:29:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2614'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-17T12:29:20Z'
---
# calendar.view.week.Component: getEventDragZone()

To enable creating new events via drag&drop, we need to move the event drag zone adjustments into its own getter, so that we can access it via `onEventDragStart()` and `onColumnDragStart()`.

## Timeline

- 2021-07-17T12:28:57Z @tobiu added the `enhancement` label
- 2021-07-17T12:28:57Z @tobiu assigned to @tobiu
- 2021-07-17T12:29:17Z @tobiu referenced in commit `d3a3896` - "calendar.view.week.Component: getEventDragZone() #2614"
- 2021-07-17T12:29:20Z @tobiu closed this issue

