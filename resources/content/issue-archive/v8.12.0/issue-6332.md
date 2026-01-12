---
id: 6332
title: 'draggable.toolbar.SortZone: adjustProxyRectToParent, itemMargin configs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-29T16:54:02Z'
updatedAt: '2025-01-29T16:54:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6332'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-29T16:54:51Z'
---
# draggable.toolbar.SortZone: adjustProxyRectToParent, itemMargin configs

* The goal is to remove the entire `onDragStart()` logic inside `draggable.toolbar.SortZone`
* We can not easily move the itemMargin into CSS, since it would kick in before the size of the parent container gets adjusted => wrong sizing

## Timeline

- 2025-01-29T16:54:03Z @tobiu added the `enhancement` label
- 2025-01-29T16:54:03Z @tobiu assigned to @tobiu
- 2025-01-29T16:54:29Z @tobiu referenced in commit `1573261` - "draggable.toolbar.SortZone: adjustProxyRectToParent, itemMargin configs #6332"
- 2025-01-29T16:54:51Z @tobiu closed this issue

