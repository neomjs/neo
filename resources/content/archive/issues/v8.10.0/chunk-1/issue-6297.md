---
id: 6297
title: 'table.Container: move the selectionModel to table.View'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-26T16:07:44Z'
updatedAt: '2025-01-26T16:53:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6297'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-26T16:53:39Z'
---
# table.Container: move the selectionModel to table.View

* To not break anything, I will keep the config as deprecated until neo v9 inside `table.Container` as well and forward the value to view
* Update all examples & apps which use tables => move `selectionModel` configs into `viewConfig`
* Update all table-related selection models

## Timeline

- 2025-01-26T16:07:44Z @tobiu added the `enhancement` label
- 2025-01-26T16:07:44Z @tobiu assigned to @tobiu
- 2025-01-26T16:08:07Z @tobiu referenced in commit `275fdc5` - "table.Container: move the selectionModel to table.View #6297"
- 2025-01-26T16:10:59Z @tobiu referenced in commit `6f713db` - "#6297 selection.table.RowModel"
- 2025-01-26T16:15:35Z @tobiu referenced in commit `16d6af8` - "#6297 selection.table.ColumnModel"
- 2025-01-26T16:17:45Z @tobiu referenced in commit `6c4f937` - "#6297 selection.table.CellColumnModel"
- 2025-01-26T16:19:54Z @tobiu referenced in commit `1f79e54` - "#6297 selection.table.CellColumnRowModel"
- 2025-01-26T16:31:31Z @tobiu referenced in commit `af51fb8` - "#6297 table.plugin.CellEditing"
- 2025-01-26T16:32:15Z @tobiu referenced in commit `a7ff307` - "#6297 examples.table.cellEditing.MainContainer"
- 2025-01-26T16:37:49Z @tobiu referenced in commit `4152505` - "#6297 examples.tableFiltering.MainContainer"
- 2025-01-26T16:51:37Z @tobiu referenced in commit `315c3b7` - "#6297 examples.tableStore.MainContainer"
- 2025-01-26T16:53:39Z @tobiu closed this issue

