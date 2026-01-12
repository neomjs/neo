---
id: 6497
title: 'toolbar.Base: afterSetDock() => use this.set()'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-02-26T16:14:44Z'
updatedAt: '2025-02-26T16:15:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6497'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T16:15:23Z'
---
# toolbar.Base: afterSetDock() => use this.set()

* I just noticed that the 2 sequential updates no longer always work (cls & layout)
* They should be merged into the same cycle anyway

## Timeline

- 2025-02-26T16:14:44Z @tobiu added the `bug` label
- 2025-02-26T16:15:04Z @tobiu referenced in commit `bd431a0` - "toolbar.Base: afterSetDock() => use this.set() #6497"
- 2025-02-26T16:15:23Z @tobiu closed this issue

