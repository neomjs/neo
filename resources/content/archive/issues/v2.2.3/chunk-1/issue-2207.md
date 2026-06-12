---
id: 2207
title: 'core.Base: set() => performance improvement'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-29T13:58:53Z'
updatedAt: '2021-05-29T14:03:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2207'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-29T14:03:36Z'
---
# core.Base: set() => performance improvement

thinking more about #2201, we only need to finish the initial processing.

subsequent calls of `set()` should merge the symbol based configs to apply the latest state.

## Timeline

- 2021-05-29T13:58:53Z @tobiu added the `enhancement` label
- 2021-05-29T13:58:53Z @tobiu assigned to @tobiu
- 2021-05-29T14:03:18Z @tobiu referenced in commit `5426246` - "core.Base: set() => performance improvement #2207"
- 2021-05-29T14:03:36Z @tobiu closed this issue

