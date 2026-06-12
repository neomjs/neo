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
blockedBy: []
blocking: []
closedAt: '2025-10-31T20:57:27Z'
---
# Implement unregister in ScrollSync addon

The `unregister` method in `src/main/addon/ScrollSync.mjs` is not implemented. To properly unregister scroll sync listeners, we need to store the listener references upon registration and then use those references to remove them in `unregister`.

## Timeline

- 2025-10-31T20:24:40Z @tobiu added the `enhancement` label
- 2025-10-31T20:24:40Z @tobiu added the `ai` label
- 2025-10-31T20:55:18Z @tobiu assigned to @tobiu
- 2025-10-31T20:57:23Z @tobiu referenced in commit `2725361` - "Implement unregister in ScrollSync addon #7682"
- 2025-10-31T20:57:28Z @tobiu closed this issue

