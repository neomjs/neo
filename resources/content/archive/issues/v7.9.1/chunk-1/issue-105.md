---
id: 105
title: 'component.Helix: buffered sorting'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2019-11-26T12:41:27Z'
updatedAt: '2024-09-29T02:38:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/105'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:38:43Z'
---
# component.Helix: buffered sorting

Now that component.Helix does support a maxItems config, sorting will cause bugs.

The initial sorting implementation was meant to sort the items which are visible inside the view.

With more items inside the store than inside the view, a sorting operation needs to remove or add items as needed.

## Timeline

- 2019-11-26T12:41:27Z @tobiu added the `enhancement` label
- 2019-11-28T11:24:01Z @tobiu referenced in commit `3559671` - "component.Helix: buffered sorting #105 => disabled the sorting buttons until the buffered sorting is in place"
### @github-actions - 2024-09-15T02:36:58Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-15T02:36:59Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:38:42Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:38:43Z @github-actions closed this issue

