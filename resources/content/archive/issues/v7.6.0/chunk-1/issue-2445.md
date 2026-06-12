---
id: 2445
title: 'calendar.view.week.Component: drag:end animations'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2021-06-21T17:36:42Z'
updatedAt: '2024-09-16T02:36:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2445'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:51Z'
---
# calendar.view.week.Component: drag:end animations

this feel a bit inconsistent:
we get resize and drag animations when moving inside the same column, except when dragging an event before another one (in which case a store.sort() happens and the event dom nodes get switched).

we also do not get animations in case we drag an event into a different column.

to resolve this, we need a custom animation:
get the `DOMRect`s of the old event and of the last proxy el position.
Create an absolute positioned clone of the event at the old position, move it to the new spot via CSS transitions (left, top, height), then move the real event node instantly.

the drag:end animation should be optional (vm config to disable it).

## Timeline

- 2021-06-21T17:36:42Z @tobiu added the `enhancement` label
- 2021-06-21T17:36:42Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-01T02:38:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:33Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:51Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:51Z @github-actions closed this issue

