---
id: 3559
title: 'data.Store: beforeSetData() => temp record ids'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-11-10T17:30:27Z'
updatedAt: '2024-09-14T02:26:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3559'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:47Z'
---
# data.Store: beforeSetData() => temp record ids

`collection.Base` provides support for adding new items without an id (keyProperty) value, using negative unique indexes:
https://github.com/neomjs/neo/blob/dev/src/collection/Base.mjs#L1153

`data.Store` needs to use this as well.

## Timeline

- 2022-11-10T17:30:27Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-30T02:27:43Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:43Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:46Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:47Z @github-actions closed this issue

