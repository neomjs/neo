---
id: 6508
title: 'draggable.toolbar.SortZone: adjustItemRectsToParent config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T22:35:33Z'
updatedAt: '2025-02-26T22:37:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6508'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T22:37:30Z'
---
# draggable.toolbar.SortZone: adjustItemRectsToParent config

Depending on the parent structure using position absolute and relative, it can be needed to subtract the x & y parent rect values from the item rects.

For tab.header.Toolbar it is needed, for grid.header.Toolbar it is not

## Timeline

- 2025-02-26T22:35:33Z @tobiu added the `enhancement` label
- 2025-02-26T22:35:33Z @tobiu assigned to @tobiu
- 2025-02-26T22:35:49Z @tobiu referenced in commit `d5089e6` - "draggable.toolbar.SortZone: adjustItemRectsToParent config #6508"
- 2025-02-26T22:37:30Z @tobiu closed this issue

