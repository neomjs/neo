---
id: 1069
title: 'calendar.view.WeekComponent: trigger the infinite scrolling onDragScroll (edge)'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2020-08-14T20:49:59Z'
updatedAt: '2024-09-27T02:34:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1069'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:34Z'
---
# calendar.view.WeekComponent: trigger the infinite scrolling onDragScroll (edge)

we do need a global scroll event listener.

drag&scroll will trigger scroll events, so in case we reach an edge, trigger a "paging" op.

## Timeline

- 2020-08-14T20:49:59Z @tobiu added the `enhancement` label
- 2020-08-14T20:52:02Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-13T02:31:22Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:22Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:34Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:34Z @github-actions closed this issue

