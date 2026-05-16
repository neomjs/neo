---
id: 992
title: 'Neo.calendar.view.MonthComponent: scrolling downwards breaks in safari'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2020-07-29T23:42:09Z'
updatedAt: '2024-09-28T02:31:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/992'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:20Z'
---
# Neo.calendar.view.MonthComponent: scrolling downwards breaks in safari

we need to use scrollTo to adjust it.

to do this, we need to store the current browser inside the neo namespace (not sure if we can get it inisde the app worker or need to do this inside the main thread and then pass it to app (along with the neo configs)).

## Timeline

- 2020-07-29T23:42:09Z @tobiu added the `enhancement` label
- 2020-07-29T23:42:09Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-14T02:27:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:14Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:20Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:21Z @github-actions closed this issue

