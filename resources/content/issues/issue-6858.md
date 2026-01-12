---
id: 6858
title: 'grid.plugin.AnimateRows: updateView() => row ids'
state: OPEN
labels:
  - bug
  - no auto close
assignees:
  - tobiu
createdAt: '2025-06-23T11:16:12Z'
updatedAt: '2025-09-22T08:34:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6858'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# grid.plugin.AnimateRows: updateView() => row ids

* Since row ids are now index based, we need a different mechanism. The internal `map` should store record ids instead.

## Timeline

- 2025-06-23T11:16:12Z @tobiu assigned to @tobiu
- 2025-06-23T11:16:14Z @tobiu added the `bug` label
### @github-actions - 2025-09-22T02:47:59Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-09-22T02:48:00Z @github-actions added the `stale` label
- 2025-09-22T08:34:12Z @tobiu removed the `stale` label
- 2025-09-22T08:34:12Z @tobiu added the `no auto close` label

