---
id: 2636
title: 'calendar.view.week.plugin.DragDrop: onColumnDragStart() => maximum start time'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-20T22:27:17Z'
updatedAt: '2021-07-20T22:27:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2636'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-20T22:27:56Z'
---
# calendar.view.week.plugin.DragDrop: onColumnDragStart() => maximum start time

the startTime must not be greater than the total time minus the minimum event duration.

example:

min duration: 30m
startTime: 23:45
endTime: 00:15 (error)

so a startTime of 23:45 needs to get changed into 23:30.

## Timeline

- 2021-07-20T22:27:17Z @tobiu added the `enhancement` label
- 2021-07-20T22:27:17Z @tobiu assigned to @tobiu
- 2021-07-20T22:27:52Z @tobiu referenced in commit `aab5f48` - "calendar.view.week.plugin.DragDrop: onColumnDragStart() => maximum start time #2636"
- 2021-07-20T22:27:56Z @tobiu closed this issue

