---
id: 8124
title: Unified Delayed DOM Update Strategy
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-16T17:48:41Z'
updatedAt: '2025-12-16T18:30:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8124'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T18:11:33Z'
---
# Unified Delayed DOM Update Strategy

We are unifying the manual DOM update path (`App.applyDeltas`) with the VDOM update path to ensure consistent behavior and delayed replies (synced with `requestAnimationFrame`).

**Plan:**

1.  **`src/worker/App.mjs`**:
    -   Update `applyDeltas` to send `action: 'updateVdom'` instead of `'updateDom'`.

2.  **`src/worker/Manager.mjs`**:
    -   In `onWorkerMessage`, add a handler for `action === 'updateVdom'`.
    -   This handler will:
        -   Fire the `updateVdom` event.
        -   Register a promise for the message `id`.
        -   Define the promise resolution to send a `reply` back to the origin worker.
    -   This mirrors the existing interception logic for VDOM replies but handles direct requests.

3.  **`src/Main.mjs`**:
    -   Remove `onUpdateDom` and the listener for `'message:updateDom'`.
    -   Use the existing `onUpdateVdom` (no `windowId` check is needed as routing is handled by the worker infrastructure).

4.  **`src/main/DeltaUpdates.mjs`**:
    -   Remove the `Neo.worker.Manager.sendMessage` (reply) call. The reply responsibility is fully shifted to `Main` (via `processQueue` -> `resolveDomOperationPromise`) resolving the promise managed by `Manager`.

This changes removes the redundant `onUpdateDom` path and ensures `App.applyDeltas` benefits from the same rAF synchronization as VDOM updates.

## Timeline

- 2025-12-16T17:48:42Z @tobiu added the `bug` label
- 2025-12-16T17:48:42Z @tobiu added the `refactoring` label
- 2025-12-16T17:48:42Z @tobiu added the `architecture` label
- 2025-12-16T18:07:51Z @tobiu assigned to @tobiu
- 2025-12-16T18:11:03Z @tobiu referenced in commit `b20ec53` - "Unified Delayed DOM Update Strategy #8124"
- 2025-12-16T18:11:33Z @tobiu closed this issue
- 2025-12-16T18:30:12Z @tobiu added the `ai` label

