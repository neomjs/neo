---
id: 6563
title: 'grid.plugin.AnimateRows: add rows => check the store'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-03-09T22:47:26Z'
updatedAt: '2025-03-09T22:47:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6563'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# grid.plugin.AnimateRows: add rows => check the store

* Currently we are only checking if a row is inside the mounted range
* While there is a memory overhead, it would be nice to check if inside the pre-load store state, the row (record id) was present

## Timeline

- 2025-03-09T22:47:26Z @tobiu added the `enhancement` label
- 2025-03-09T22:47:26Z @tobiu added the `no auto close` label
- 2025-03-09T22:47:26Z @tobiu assigned to @tobiu

