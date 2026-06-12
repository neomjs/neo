---
id: 6505
title: 'draggable.toolbar.SortZone: onDragStart() => sortDirection'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T20:53:19Z'
updatedAt: '2025-02-26T20:53:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6505'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T20:53:58Z'
---
# draggable.toolbar.SortZone: onDragStart() => sortDirection

* Since we are no longer replacing layout instances, the check for layout `ntype` can no longer work as before
* We need to check for the layout `direction` instead

## Timeline

- 2025-02-26T20:53:19Z @tobiu added the `enhancement` label
- 2025-02-26T20:53:19Z @tobiu assigned to @tobiu
- 2025-02-26T20:53:39Z @tobiu referenced in commit `22d1222` - "draggable.toolbar.SortZone: onDragStart() => sortDirection #6505"
- 2025-02-26T20:53:58Z @tobiu closed this issue

