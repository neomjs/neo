---
id: 6640
title: 'grid.column.Component: cellRenderer() => renew bound controller configs on each change'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-04-10T20:08:55Z'
updatedAt: '2025-04-10T20:09:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6640'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-10T20:09:20Z'
---
# grid.column.Component: cellRenderer() => renew bound controller configs on each change

* The componentConfig can contain bindings into a view controller, e.g. a button handler = 'editButtonHandler'
* componentConfig.set(component) can revert these, so we need a parseConfig() for each change.

## Timeline

- 2025-04-10T20:08:55Z @tobiu added the `enhancement` label
- 2025-04-10T20:09:10Z @tobiu referenced in commit `71d7d7e` - "grid.column.Component: cellRenderer() => renew bound controller configs on each change #6640"
- 2025-04-10T20:09:20Z @tobiu closed this issue

