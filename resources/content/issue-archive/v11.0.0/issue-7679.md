---
id: 7679
title: 'ChromaManager.mjs: getMemoryCollection should use getOrCreateCollection'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-31T19:11:15Z'
updatedAt: '2025-10-31T19:13:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7679'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-31T19:13:15Z'
---
# ChromaManager.mjs: getMemoryCollection should use getOrCreateCollection

`getMemoryCollection()` uses `getCollection()`. `getSummaryCollection()` uses `getOrCreateCollection()`. This can result in an error for first time users, which have not created the collections otherwise.

## Timeline

- 2025-10-31T19:11:16Z @tobiu added the `bug` label
- 2025-10-31T19:11:16Z @tobiu added the `ai` label
- 2025-10-31T19:12:32Z @tobiu assigned to @tobiu
- 2025-10-31T19:13:07Z @tobiu referenced in commit `ab107cd` - "ChromaManager.mjs: getMemoryCollection should use getOrCreateCollection #7679"
- 2025-10-31T19:13:15Z @tobiu closed this issue

