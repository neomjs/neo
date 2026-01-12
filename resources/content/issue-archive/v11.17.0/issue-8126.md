---
id: 8126
title: 'Manager.mjs: Refactor `onWorkerMessage` to remove redundancy'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-16T18:37:29Z'
updatedAt: '2025-12-16T18:48:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8126'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T18:48:54Z'
---
# Manager.mjs: Refactor `onWorkerMessage` to remove redundancy

The `onWorkerMessage` method in `src/worker/Manager.mjs` has accumulated redundant logic for handling message replies, specifically the promise registration and `sendMessage` sequence. This has been exacerbated by the recent addition of `updateVdom` handling and the zero-delta optimization.

**Goal:**
Refactor `onWorkerMessage` to eliminate code duplication by extracting the common reply/promise logic into a reusable helper method.

**Plan:**
1.  Identify the common pattern:
    -   Check for deltas.
    -   If empty -> Immediate reply.
    -   If present -> Register promise -> Fire event -> Send reply on promise resolution.
2.  Create a helper method `handleDomUpdate({ data, eventName })`.
    -   `data`: The message payload.
    -   `eventName`: The event to fire (e.g., `'updateVdom'`, `'automount'`).
3.  Update `onWorkerMessage` to use this helper for both `action === 'updateVdom'` and the `action === 'reply'` (VDOM) path.

This will reduce file size and improve maintainability.

## Timeline

- 2025-12-16T18:37:30Z @tobiu added the `refactoring` label
- 2025-12-16T18:37:41Z @tobiu assigned to @tobiu
- 2025-12-16T18:48:16Z @tobiu added the `ai` label
- 2025-12-16T18:48:36Z @tobiu referenced in commit `0137fd8` - "Manager.mjs: Refactor onWorkerMessage to remove redundancy #8126"
- 2025-12-16T18:48:54Z @tobiu closed this issue

