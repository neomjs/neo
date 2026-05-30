---
id: 5460
title: 'plugin.Responsive: owner.on({mounted: ''onOwnerMounted''})'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - Dinkh
createdAt: '2024-06-23T08:31:45Z'
updatedAt: '2024-10-06T02:38:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5460'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-06T02:38:07Z'
---
# plugin.Responsive: owner.on({mounted: 'onOwnerMounted'})

we need to move the resize listener logic outside of `construct()`.

rationale: moving a component into the viewport of a different window => we still want it to be responsive.

## Timeline

- 2024-06-23T08:31:45Z @tobiu added the `enhancement` label
- 2024-06-23T08:31:45Z @tobiu assigned to @Dinkh
- 2024-06-23T08:31:58Z @tobiu changed title from **plugin.Responsive: owner.on({mounted: 'onOwnerMounted'}** to **plugin.Responsive: owner.on({mounted: 'onOwnerMounted'})**
### @github-actions - 2024-09-22T02:36:40Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-22T02:36:41Z @github-actions added the `stale` label
### @github-actions - 2024-10-06T02:38:06Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-10-06T02:38:07Z @github-actions closed this issue

