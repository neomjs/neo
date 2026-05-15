---
id: 6565
title: 'grid.plugin.AnimateRows: component based columns & cycling'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
assignees:
  - tobiu
createdAt: '2025-03-09T22:52:13Z'
updatedAt: '2025-03-09T22:52:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6565'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# grid.plugin.AnimateRows: component based columns & cycling

* tricky one: components cycle => they are index based
* a view with 10 rows => filter change => 5 get added, 5 get removed, 5 get moved => 15 => more than the cycle range and cmps inside cells can get moved
* we need a concept to handle it (e.g. a vdom & vnode clone with different ids)

## Timeline

- 2025-03-09T22:52:13Z @tobiu added the `enhancement` label
- 2025-03-09T22:52:13Z @tobiu added the `help wanted` label
- 2025-03-09T22:52:13Z @tobiu assigned to @tobiu
- 2025-03-09T22:52:22Z @tobiu added the `no auto close` label

