---
id: 6628
title: 'Covid.view.country.Table: make the index column non-sortable'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-07T14:20:56Z'
updatedAt: '2025-04-07T14:23:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6628'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-07T14:23:40Z'
---
# Covid.view.country.Table: make the index column non-sortable

* `table.header.Toolbar: createItems()` needs to prioritize item based `sortable` configs
* the covid app, shared covid app & examples/table/covid need to use `sortable: false` for the index column

rationale: while there is an `index` field inside the `data.Model`, it has no values inside the store data. sorting by this column makes little sense anyway, since it is supposed to display ascending values.

## Timeline

- 2025-04-07T14:20:56Z @tobiu added the `enhancement` label
- 2025-04-07T14:20:57Z @tobiu assigned to @tobiu
- 2025-04-07T14:21:14Z @tobiu referenced in commit `864f2cc` - "Covid.view.country.Table: make the index column non-sortable #6628"
- 2025-04-07T14:23:29Z @tobiu referenced in commit `1f4023d` - "#6628 grid.header.Toolbar: applied the same honor item based sorting defaults change"
- 2025-04-07T14:23:40Z @tobiu closed this issue

