---
id: 7682
title: Implement unregister in ScrollSync addon
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-31T20:24:39Z'
updatedAt: '2025-10-31T20:57:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7682'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-31T20:57:27Z'
---
# Implement unregister in ScrollSync addon

**Reported by:** @tobiu on 2025-10-31

The `unregister` method in `src/main/addon/ScrollSync.mjs` is not implemented. To properly unregister scroll sync listeners, we need to store the listener references upon registration and then use those references to remove them in `unregister`.

