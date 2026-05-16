---
id: 6164
title: 'table.plugin.CellEditing: selectCell()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-12-18T16:25:40Z'
updatedAt: '2024-12-18T16:26:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6164'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-12-18T16:26:01Z'
---
# table.plugin.CellEditing: selectCell()

* While an editor is mounted, we can walk through the column using the `Tab` key.
* When closing an editor via `Enter` or `Escape`, we need to (re)select the table cell to (re)enable the `KeyboardNavigation`.

## Timeline

- 2024-12-18T16:25:40Z @tobiu added the `enhancement` label
- 2024-12-18T16:25:40Z @tobiu assigned to @tobiu
- 2024-12-18T16:25:55Z @tobiu referenced in commit `9b913d0` - "table.plugin.CellEditing: selectCell() #6164"
- 2024-12-18T16:26:02Z @tobiu closed this issue

