---
id: 2797
title: 'list.plugin.Animate: support for dynamically adding and removing items'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2022-01-03T06:59:42Z'
updatedAt: '2024-09-15T02:36:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2797'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:10Z'
---
# list.plugin.Animate: support for dynamically adding and removing items

We could use the `collection.Base:mutate` event, which includes moving and inserting items as well.

Most of the logic is already inside `onStoreFilter()`, so we can re-use it in a smart way.

## Timeline

- 2022-01-03T06:59:42Z @tobiu added the `enhancement` label
- 2022-01-03T06:59:42Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-31T02:26:08Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:08Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:10Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:10Z @github-actions closed this issue

