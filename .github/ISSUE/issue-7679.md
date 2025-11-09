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
closedAt: '2025-10-31T19:13:15Z'
---
# ChromaManager.mjs: getMemoryCollection should use getOrCreateCollection

**Reported by:** @tobiu on 2025-10-31

`getMemoryCollection()` uses `getCollection()`. `getSummaryCollection()` uses `getOrCreateCollection()`. This can result in an error for first time users, which have not created the collections otherwise.

