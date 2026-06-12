---
id: 3805
title: 'component.Toast: multi window support'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - Dinkh
createdAt: '2023-01-06T12:17:36Z'
updatedAt: '2024-09-14T02:26:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3805'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:15Z'
---
# component.Toast: multi window support

we need to add a `running` config for each `appName`.

manager.Component: updateItemsInPosition() needs to fetch the domRects for each realm. please use `Promise.all()` for this one.

## Timeline

- 2023-01-06T12:17:36Z @tobiu added the `enhancement` label
- 2023-01-06T12:17:37Z @tobiu assigned to @Dinkh
### @github-actions - 2024-08-30T02:27:15Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:15Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:15Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:15Z @github-actions closed this issue

