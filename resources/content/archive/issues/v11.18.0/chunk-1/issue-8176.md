---
id: 8176
title: Implement Neural Link State Rehydration on Reconnect
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T17:39:32Z'
updatedAt: '2025-12-28T17:53:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8176'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T17:53:24Z'
---
# Implement Neural Link State Rehydration on Reconnect

When the Neural Link client reconnects (e.g. server restart), it must rehydrate the server with the current state.

**Requirements:**
1.  **Client (`src/ai/Client.mjs`)**:
    -   In `onSocketOpen`, after sending `register`:
    -   Iterate over `Neo.manager.Window.items`.
    -   Send `window_connected` notification for each active window.
    -   Check `Neo.manager.DragCoordinator` and send drag state if dragging.

**Goal:**
Ensure the Neural Link server rebuilds its topology map immediately upon connection.

## Timeline

- 2025-12-28T17:39:33Z @tobiu added the `enhancement` label
- 2025-12-28T17:39:34Z @tobiu added the `ai` label
- 2025-12-28T17:39:44Z @tobiu added parent issue #8169
### @tobiu - 2025-12-28T17:52:42Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have implemented the self-healing logic for the Neural Link connection.
> 
> *   **Client (`Client.mjs`):** Updated `onSocketOpen` to perform a full state dump upon connection.
> *   **Window Rehydration:** Iterates `Neo.manager.Window.items` and sends a `window_connected` notification for every active window immediately.
> *   **Drag State:** Checks `Neo.manager.DragCoordinator` and sends `drag_active` if a drag operation is currently in progress.
> 
> This ensures that if the server restarts or the connection drops, the topology is instantly rebuilt without user intervention.

- 2025-12-28T17:52:57Z @tobiu assigned to @tobiu
- 2025-12-28T17:53:24Z @tobiu closed this issue
- 2025-12-28T18:15:55Z @tobiu referenced in commit `21b8247` - "feat(ai): Implement Neural Link healing and standardize routing (#8169)

- Refactor API: Rename windowId to sessionId for clarity (#8174)
- Feat: Implement window connect/disconnect notifications (#8175)
- Feat: Add state rehydration on reconnect (#8176)
- Update Client to track lifecycle and sync topology
- Update ConnectionService to cache window state and serve topology instantly"

