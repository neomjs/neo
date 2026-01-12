---
id: 8148
title: 'Fix: Multi-Window Remote Registration and Message Routing'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-19T22:09:48Z'
updatedAt: '2025-12-19T22:11:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8148'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T22:11:50Z'
---
# Fix: Multi-Window Remote Registration and Message Routing

This PR fixes critical issues with remote method registration and message routing in multi-window applications, specifically addressing hangs and cross-talk errors when launching new windows or detaching components.

**Key Changes:**

1.  **Window ID Propagation (`Neo.worker.Manager`):**
    *   Updated `sendMessage` to automatically attach the Main Thread's `windowId` to outgoing messages if not already present (`opts.windowId ??= me.windowId`).
    *   This ensures that `registerRemote` calls (and all other messages) originating from a specific window carry the correct identifier.
    *   **Impact:** Workers (like App) can now correctly identify the source of a request and route the reply back to the *specific* Main Thread (Window) that sent it, preventing replies from being sent to the wrong window (e.g., the primary window instead of a popup).

2.  **Message Forwarding Fix (`Neo.worker.Manager`):**
    *   Updated `onWorkerMessage` to explicitly set `response.destination = data.origin` when forwarding message replies.
    *   **Impact:** Prevents the Manager from incorrectly attempting to route a reply to 'main' (causing a crash) when it should be forwarding it back to the original sender (e.g., 'app').

3.  **Robust Worker Checking (`Neo.worker.Base`, `Neo.worker.Manager`):**
    *   Added `hasWorker(name)` method to `Neo.worker.Base` (checking `Neo.config`) and `Neo.worker.Manager` (checking `getWorker`).
    *   **Impact:** Allows safe verification of optional workers (like 'canvas', 'task', 'service') before attempting communication, preventing runtime errors when they are disabled.

**Goal:**
Ensure stable and correct message routing in complex multi-window environments, enabling features like `AgentOS` component detachment to work without crashing the original window or hanging the new one.

## Timeline

- 2025-12-19T22:09:48Z @tobiu added the `bug` label
- 2025-12-19T22:09:49Z @tobiu added the `ai` label
- 2025-12-19T22:09:49Z @tobiu added the `core` label
- 2025-12-19T22:10:38Z @tobiu assigned to @tobiu
- 2025-12-19T22:11:39Z @tobiu referenced in commit `c45b566` - "Fix: Multi-Window Remote Registration and Message Routing #8148"
- 2025-12-19T22:11:50Z @tobiu closed this issue
- 2025-12-19T22:27:52Z @tobiu cross-referenced by #8149

