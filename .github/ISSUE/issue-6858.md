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
---
# grid.plugin.AnimateRows: updateView() => row ids

**Reported by:** @tobiu on 2025-06-23

* Since row ids are now index based, we need a different mechanism. The internal `map` should store record ids instead.

## Comments

### @github-actions - 2025-09-22 02:47

This issue is stale because it has been open for 90 days with no activity.

