---
id: 6026
title: 'main.addon.FileSystemAccess: use async methods'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-10-08T11:12:46Z'
updatedAt: '2024-10-08T11:13:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6026'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-08T11:13:34Z'
---
# main.addon.FileSystemAccess: use async methods

@gplanansky: we should use async methods here, since the 3 target API methods itself are async too.

For remote method access it does not matter, since neo will handle it, however, devs could use it inside other main thread addons.

I will add `@returns` doc comments while i am on it.

## Timeline

- 2024-10-08T11:12:46Z @tobiu added the `enhancement` label
- 2024-10-08T11:12:46Z @tobiu assigned to @tobiu
- 2024-10-08T11:13:30Z @tobiu referenced in commit `0d95b4c` - "main.addon.FileSystemAccess: use async methods #6026"
- 2024-10-08T11:13:34Z @tobiu closed this issue

