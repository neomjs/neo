---
id: 6498
title: 'toolbar.Base: afterSetDock() => re-use layout instances'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T16:17:04Z'
updatedAt: '2025-02-26T20:04:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6498'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T20:04:04Z'
---
# toolbar.Base: afterSetDock() => re-use layout instances

* While I doubt that run-time dock changes will happen often inside real world apps, it would still be nice to re-use layout instances
* less delta updates
* first call needs to create the flexbox layout
* following calls need to change layout configs

## Timeline

- 2025-02-26T16:17:04Z @tobiu added the `enhancement` label
- 2025-02-26T16:17:04Z @tobiu assigned to @tobiu
- 2025-02-26T20:03:59Z @tobiu referenced in commit `ef00079` - "toolbar.Base: afterSetDock() => re-use layout instances #6498"
- 2025-02-26T20:04:04Z @tobiu closed this issue

