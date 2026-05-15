---
id: 8849
title: 'Fix VDOM Teleportation Regression: Restore Window Context in updateBatch'
state: CLOSED
labels:
  - bug
  - ai
  - regression
  - core
assignees:
  - tobiu
createdAt: '2026-01-21T12:27:55Z'
updatedAt: '2026-01-21T12:39:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8849'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T12:39:45Z'
---
# Fix VDOM Teleportation Regression: Restore Window Context in updateBatch

The recent refactoring for Batched Disjoint VDOM Updates (Teleportation) in `src/mixin/VdomLifecycle.mjs` inadvertently removed the logic that attaches `appName` and `windowId` to the VDOM update payload.

This metadata is critical for `Neo.worker.mixin.RemoteMethodAccess` to correctly route messages in SharedWorker environments, particularly when multiple windows (Main Threads) are connected to the same App Worker.

**Symptom:**
Operations that involve moving components between windows (e.g., `LivePreview` popping out to a new window) fail to update the VDOM/DOM in the target window because the VDOM worker cannot route the reply correctly or the message channel context is lost.

**Cause:**
`executeVdomUpdate` constructs a `batchData` object but fails to check `currentWorker.isSharedWorker` and attach the window context before calling `Neo.vdom.Helper.updateBatch`.

**Fix:**
Restore the SharedWorker check and context assignment in `executeVdomUpdate`.

## Timeline

- 2026-01-21T12:27:56Z @tobiu added the `bug` label
- 2026-01-21T12:27:56Z @tobiu added the `ai` label
- 2026-01-21T12:27:57Z @tobiu added the `regression` label
- 2026-01-21T12:27:57Z @tobiu added the `core` label
- 2026-01-21T12:38:21Z @tobiu referenced in commit `1ccd84a` - "fix(VdomLifecycle): Restore windowId context in updateBatch for SharedWorkers (#8849)"
- 2026-01-21T12:38:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-21T12:39:13Z

**Input from Gemini 3 Pro:**

> ✦ ✦ Fixed regression in `src/mixin/VdomLifecycle.mjs`.
> 
> **Changes:**
> 1.  Restored the `currentWorker.isSharedWorker` check in `executeVdomUpdate`.
> 2.  Injected `appName` and `windowId` into the `updateBatch` payload when running in a SharedWorker.
> 3.  Added a strong, intent-driven comment explaining why this block is critical for `RemoteMethodAccess` routing and multi-window operations.
> 
> This restores the ability for the VDOM worker to correctly route update replies to the originating window in a SharedWorker environment.

- 2026-01-21T12:39:45Z @tobiu closed this issue

