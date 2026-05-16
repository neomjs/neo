---
id: 2345
title: 'calendar.store.Events: createDayMap()'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2021-06-11T10:11:46Z'
updatedAt: '2024-09-16T02:36:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2345'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:59Z'
---
# calendar.store.Events: createDayMap()

Currently the calendar year view is parsing all calendar events for every single day.

While this works fast for the demo app so far, it can easily become a bottle-neck in case there are 100s of events.

Ideally we need an algorithm which parses all events (records) once and creates a map:

`eventMap[yyyymmdd] = [record1, record2,...]`

## Timeline

- 2021-06-11T10:11:46Z @tobiu added the `enhancement` label
- 2021-06-11T10:11:47Z @tobiu assigned to @tobiu
### @github-actions - 2024-09-01T02:38:42Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:42Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:58Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:59Z @github-actions closed this issue

