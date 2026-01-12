---
id: 7977
title: Sanitize commander inputs in buildScripts/buildAll.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:31:15Z'
updatedAt: '2025-12-02T17:43:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7977'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T17:43:10Z'
---
# Sanitize commander inputs in buildScripts/buildAll.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes (e.g., `-t "yes"`).
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/buildAll.mjs`.

References:
- `buildScripts/buildAll.mjs`

## Timeline

- 2025-12-02T17:31:16Z @tobiu added the `bug` label
- 2025-12-02T17:31:17Z @tobiu added the `ai` label
- 2025-12-02T17:32:10Z @tobiu assigned to @tobiu
- 2025-12-02T17:43:10Z @tobiu closed this issue
- 2025-12-02T17:46:38Z @tobiu referenced in commit `511eb52` - "Sanitize commander inputs in buildScripts/buildAll.mjs #7977"

