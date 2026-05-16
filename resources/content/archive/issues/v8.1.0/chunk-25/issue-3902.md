---
id: 3902
title: Examine string based scopes like "this" or "me"
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-01-18T14:23:56Z'
updatedAt: '2024-09-14T02:26:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3902'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:08Z'
---
# Examine string based scopes like "this" or "me"

`listeners: {change: 'onChange', scope: 'this'}` => could walk up the component tree and find the closest implementation.

an alternative could be to parse items for a container to detect string based event scopes. might be more expensive though.

## Timeline

- 2023-01-18T14:23:56Z @tobiu added the `enhancement` label
- 2023-01-18T14:23:57Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-30T02:27:09Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:10Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:08Z @github-actions closed this issue

