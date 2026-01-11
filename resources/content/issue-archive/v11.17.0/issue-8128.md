---
id: 8128
title: 'Manager.mjs: Fix regression in autoMount handling'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-16T19:07:28Z'
updatedAt: '2025-12-16T19:12:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8128'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T19:12:55Z'
---
# Manager.mjs: Fix regression in autoMount handling

The proposed refactoring of `vdom.Helper` was rejected due to payload duplication concerns. We are proceeding with the fix in `Manager.mjs` to correctly handle `autoMount` messages which lack deltas but must be queued.

**Fix:**
In `onWorkerMessage`, when calling `handleDomUpdate` for the `reply` path, pass a placeholder array `[1]` if `data.data.autoMount` is true. This forces the helper to queue the update, ensuring the `automount` event is fired and processed by `Main`.

## Timeline

- 2025-12-16T19:07:29Z @tobiu added the `bug` label
- 2025-12-16T19:07:46Z @tobiu assigned to @tobiu
- 2025-12-16T19:07:57Z @tobiu added the `ai` label
- 2025-12-16T19:12:47Z @tobiu referenced in commit `bfb2aca` - "Manager.mjs: Fix regression in autoMount handling #8128"
- 2025-12-16T19:12:55Z @tobiu closed this issue

