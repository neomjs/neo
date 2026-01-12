---
id: 6564
title: 'grid.plugin.AnimateRows: store listeners improvement'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-03-09T22:49:19Z'
updatedAt: '2025-03-09T22:49:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6564'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# grid.plugin.AnimateRows: store listeners improvement

* Instead of rebinding view based store listeners logic, the cleaner way would be to remove the relevant view based listeners and add own listeners to the store
* This way, we could easily restore the view to its previous state, in case the plugin needs to get disabled at run-time

## Timeline

- 2025-03-09T22:49:19Z @tobiu added the `enhancement` label
- 2025-03-09T22:49:19Z @tobiu added the `no auto close` label
- 2025-03-09T22:49:19Z @tobiu assigned to @tobiu

