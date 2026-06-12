---
id: 483
title: selection.Model should only update the vdom if really needed
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2020-04-15T21:29:42Z'
updatedAt: '2024-09-28T02:31:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/483'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:51Z'
---
# selection.Model should only update the vdom if really needed

for most if not all use cases, manually creating the deltas could be a performance boost.

there has to be a check though if the view is updating and if so delay it.

e.g. table.Container => check table.Container and table.View

## Timeline

- 2020-04-15T21:29:42Z @tobiu added the `enhancement` label
- 2020-04-15T21:29:59Z @tobiu changed title from **selection.Model should only update the vdom is really needed** to **selection.Model should only update the vdom if really needed**
### @github-actions - 2024-09-14T02:27:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:39Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:50Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:51Z @github-actions closed this issue

