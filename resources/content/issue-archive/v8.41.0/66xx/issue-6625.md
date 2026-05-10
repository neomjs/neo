---
id: 6625
title: 'table.header.Toolbar: drag&drop resorting broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-04-06T16:42:11Z'
updatedAt: '2025-04-06T16:42:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6625'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-06T16:42:37Z'
---
# table.header.Toolbar: drag&drop resorting broken

* `draggable.toolbar.SortZone` checks for a `layout.direction`.
* This works fine for the grid & tab header toolbar, but a table header toolbar is using `layout.Base` => has no direction

## Timeline

- 2025-04-06T16:42:11Z @tobiu added the `bug` label
- 2025-04-06T16:42:17Z @tobiu assigned to @tobiu
- 2025-04-06T16:42:30Z @tobiu referenced in commit `ef008dc` - "table.header.Toolbar: drag&drop resorting broken #6625"
- 2025-04-06T16:42:37Z @tobiu closed this issue

