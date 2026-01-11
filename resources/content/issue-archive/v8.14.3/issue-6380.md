---
id: 6380
title: 'draggable.toolbar.DragZone: add neo-draggable when toolbar items got replaced'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-04T15:30:46Z'
updatedAt: '2025-02-04T15:31:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6380'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-04T15:31:59Z'
---
# draggable.toolbar.DragZone: add neo-draggable when toolbar items got replaced

* Important for the grid, where we can set `columns` to something else
* `container.Base` needs a new `itemsCreated` event
* `draggable.toolbar.DragZone` needs to subscribe and trigger `adjustToolbarItemCls()`

## Timeline

- 2025-02-04T15:30:46Z @tobiu added the `enhancement` label
- 2025-02-04T15:30:46Z @tobiu assigned to @tobiu
- 2025-02-04T15:31:06Z @tobiu referenced in commit `bbd8c58` - "draggable.toolbar.DragZone: add neo-draggable when toolbar items got replaced #6380"
- 2025-02-04T15:31:59Z @tobiu closed this issue

