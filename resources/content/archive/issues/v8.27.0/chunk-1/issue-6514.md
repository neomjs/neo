---
id: 6514
title: 'selection.grid.ColumnModel: add support for buffered rendering'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-01T15:06:04Z'
updatedAt: '2025-03-01T15:16:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6514'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-01T15:16:01Z'
---
# selection.grid.ColumnModel: add support for buffered rendering

* new top-level config selectedColumns to store dataFields
* grid.View: applyRendererOutput() needs to honor it
* onCellClick() and other change methods need to trigger grid.View: createViewData()

## Timeline

- 2025-03-01T15:06:04Z @tobiu added the `enhancement` label
- 2025-03-01T15:06:04Z @tobiu assigned to @tobiu
- 2025-03-01T15:06:23Z @tobiu referenced in commit `e446ec3` - "selection.grid.ColumnModel: add support for buffered rendering #6514 WIP"
- 2025-03-01T15:13:11Z @tobiu referenced in commit `43bdaef` - "selection.grid.ColumnModel: add support for buffered rendering #6514"
### @tobiu - 2025-03-01T15:16:01Z

https://github.com/user-attachments/assets/56ee0f26-164f-4198-b62e-901cd0a52cfb

- 2025-03-01T15:16:01Z @tobiu closed this issue

