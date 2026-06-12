---
id: 3335
title: 'form.field.Text: reset() => enhance the logic to only trigger one vdom update'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-08-01T12:00:14Z'
updatedAt: '2024-09-14T02:26:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3335'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:55Z'
---
# form.field.Text: reset() => enhance the logic to only trigger one vdom update

to do this, we most likely should extract the logic from `afterSetValue()` into a new method using a silent param. we should also fire the change event at the very end of the `reset()` call.

## Timeline

- 2022-08-01T12:00:14Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-30T02:27:50Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:51Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:55Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:55Z @github-actions closed this issue

