---
id: 3958
title: Covid app routing to the table view
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-30T08:27:00Z'
updatedAt: '2024-09-14T02:26:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3958'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:05Z'
---
# Covid app routing to the table view

in case we start the app from a different view than the table (e.g. mapboxGL) and then navigate to the table, we get some new JS errors:

<img width="679" alt="Screenshot 2023-01-30 at 09 25 57" src="https://user-images.githubusercontent.com/1177434/215425146-941810d9-bf46-4130-b547-7d1c36a89d6d.png">

this is related to the 2way-binding adjustments. the `country` config will get set before there are DOM ids in place.

## Timeline

- 2023-01-30T08:27:00Z @tobiu added the `bug` label
### @github-actions - 2024-08-30T02:27:06Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:06Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:04Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:05Z @github-actions closed this issue

