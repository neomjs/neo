---
id: 2447
title: 'calendar.view.week.Component: move the hasEventOverflow logic into the TimeAxis class or MainContainerModel'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2021-06-24T12:35:58Z'
updatedAt: '2024-09-16T02:36:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2447'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:50Z'
---
# calendar.view.week.Component: move the hasEventOverflow logic into the TimeAxis class or MainContainerModel

It makes sense, since the EventDragZone as well as the view are using it and most parts of the logic rely on the current TimeAxis values.

Another option would be to move the logic into the `model.Component`.

## Timeline

- 2021-06-24T12:35:58Z @tobiu added the `enhancement` label
- 2021-06-24T12:35:58Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-01T02:38:31Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:32Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:49Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:50Z @github-actions closed this issue

