---
id: 7783
title: Dynamically import fs/promises in Store.mjs for Node.js compatibility
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-17T18:56:11Z'
updatedAt: '2025-11-17T18:57:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7783'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-17T18:57:49Z'
---
# Dynamically import fs/promises in Store.mjs for Node.js compatibility

The `src/data/Store.mjs` currently attempts to use `fs.readFile` for non-browser environments (like Node.js) within its `load` method. However, the `fs/promises` module is conditionally imported using `globalThis.process?.release`. To prevent issues in browser environments where `fs/promises` is not available, the import needs to be dynamic.

This change will ensure that `Store.mjs` can be used seamlessly in web workers (browser environment) and Node.js, by only attempting to load the `fs/promises` module when it's actually needed and available.

**Proposed Change:**
Modify the `load` method in `src/data/Store.mjs` to use a dynamic `import('fs/promises')` when `globalThis.process?.release` is true.

## Timeline

- 2025-11-17T18:56:12Z @tobiu added the `enhancement` label
- 2025-11-17T18:56:12Z @tobiu added the `ai` label
- 2025-11-17T18:57:11Z @tobiu assigned to @tobiu
- 2025-11-17T18:57:28Z @tobiu referenced in commit `0f0ed92` - "Dynamically import fs/promises in Store.mjs for Node.js compatibility #7783"
- 2025-11-17T18:57:49Z @tobiu closed this issue

