---
id: 4531
title: 'component.wrapper.GoogleMaps: once the component gets mounted multiple times, markers no longer appear'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-07-10T13:20:44Z'
updatedAt: '2024-09-13T02:29:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4531'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:44Z'
---
# component.wrapper.GoogleMaps: once the component gets mounted multiple times, markers no longer appear

in detail:
we have `onMarkerStoreLoad()`, which expects the the map to already be mounted and show the markers.

then there is `afterSetMounted()` which simply needs a check if the store already has data and if so, re-render the markers once the map is in place.

## Timeline

- 2023-07-10T13:20:44Z @tobiu added the `bug` label
### @github-actions - 2024-08-29T02:27:08Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:44Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:44Z @github-actions closed this issue

