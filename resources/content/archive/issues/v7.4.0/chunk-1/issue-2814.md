---
id: 2814
title: 'list.plugin.Animate: combine onStoreFilter() and onStoreSort()'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2022-01-09T21:54:40Z'
updatedAt: '2024-09-15T02:36:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2814'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:09Z'
---
# list.plugin.Animate: combine onStoreFilter() and onStoreSort()

Both function work fine on their own.

However, it would cause trouble in case we would trigger a sort while a filter OP is still running.

So, combining the logic (or just re-using the filter logic for a sort event) makes sense.

## Timeline

- 2022-01-09T21:54:40Z @tobiu added the `enhancement` label
- 2022-01-09T21:54:40Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-31T02:26:07Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:07Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:09Z @github-actions closed this issue

