---
id: 4704
title: 'view.country.Table: afterSetCountry()'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2023-08-12T18:21:33Z'
updatedAt: '2024-09-13T02:29:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4704'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:17Z'
---
# view.country.Table: afterSetCountry()

looks like a new regression bug:
in case we open the app with a different route than the table and then navigate to it, the `table.View` can still be undefined.

## Timeline

- 2023-08-12T18:21:33Z @tobiu added the `bug` label
- 2023-08-12T18:21:33Z @tobiu assigned to @tobiu
- 2023-08-12T18:21:49Z @tobiu referenced in commit `270fdc1` - "view.country.Table: afterSetCountry() #4704"
### @tobiu - 2023-08-12T18:22:54Z

if we are going this route, we also need a check on `afterSetMounted()` to apply selections.

an alternative would be that `getView()` creates the `table.View`, in case it did not get created yet.

### @github-actions - 2024-08-29T02:26:47Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:48Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:16Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:17Z @github-actions closed this issue

