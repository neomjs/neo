---
id: 2815
title: 'list.plugin.Animate: remove the need to specify DOM ids for each child node'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2022-01-09T22:00:34Z'
updatedAt: '2024-09-15T02:36:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2815'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:36:07Z'
---
# list.plugin.Animate: remove the need to specify DOM ids for each child node

This is especially needed for future component based list demos which are using this plugin.

The vdom engine relies on DOM ids to check for move OPs. When executing `triggerTransitionCallback()`, we regenerate all items to remove the ones which got faded out and restore the item indexes.

To resolve this, `createItem()` needs to check for existing items within the virtual DOM and use e.g. `util.VDom: syncVdomIds()` to restore existing child ids for us.

## Timeline

- 2022-01-09T22:00:34Z @tobiu added the `enhancement` label
- 2022-01-09T22:00:35Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-31T02:26:06Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:26:06Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:36:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:36:07Z @github-actions closed this issue

