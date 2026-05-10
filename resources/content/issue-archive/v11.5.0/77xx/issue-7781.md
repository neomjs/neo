---
id: 7781
title: 'data.Store: load() => add a fallback for nodejs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-11-16T23:10:56Z'
updatedAt: '2025-11-16T23:11:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7781'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-16T23:11:26Z'
---
# data.Store: load() => add a fallback for nodejs

We need to bypass `new XMLHttpRequest()` which does not exist inside nodejs.

## Timeline

- 2025-11-16T23:10:56Z @tobiu assigned to @tobiu
- 2025-11-16T23:10:57Z @tobiu added the `enhancement` label
- 2025-11-16T23:11:18Z @tobiu referenced in commit `4f141bb` - "data.Store: load() => add a fallback for nodejs #7781"
- 2025-11-16T23:11:27Z @tobiu closed this issue

