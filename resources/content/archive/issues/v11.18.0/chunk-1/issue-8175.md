---
id: 8175
title: Implement Window Connect/Disconnect Notifications for Neural Link
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T17:39:08Z'
updatedAt: '2025-12-28T17:50:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8175'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T17:50:27Z'
---
# Implement Window Connect/Disconnect Notifications for Neural Link

The App Worker must track main thread lifecycle and notify the Neural Link server.

**Requirements:**
1.  **Client (`src/ai/Client.mjs`)**:
    -   Listen to `Neo.currentWorker` `connect` and `disconnect` events.
    -   Implement `onAppWorkerWindowConnect`: Send `window_connected` notification with window metadata (id, appName, rects).
    -   Implement `onAppWorkerWindowDisconnect`: Send `window_disconnected` notification.

2.  **Server (`ConnectionService.mjs`)**:
    -   Handle `window_connected` notification: Update `sessionData`'s `windows` map.
    -   Handle `window_disconnected` notification: Remove from `sessionData`'s `windows` map.
    -   Update `getWindowTopology` to use this cached data instead of polling (or in addition to).

**Goal:**
Ensure the Neural Link server has an up-to-date view of connected windows without needing to poll, and correctly handles window closures.

## Timeline

- 2025-12-28T17:39:08Z @tobiu added the `enhancement` label
- 2025-12-28T17:39:09Z @tobiu added the `ai` label
- 2025-12-28T17:39:41Z @tobiu added parent issue #8169
- 2025-12-28T17:39:50Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-28T17:49:55Z

**Input from Gemini 3:**

> ✦ **Implementation Complete**
> 
> I have implemented the notification layer to track window lifecycle in real-time.
> 
> *   **Client (`Client.mjs`):** Added event listeners for `Neo.currentWorker` `connect` and `disconnect` events.
> *   **Protocol:** Implemented `window_connected` (sending geometry & metadata) and `window_disconnected` notifications.
> *   **Server (`ConnectionService.mjs`):** Updated `#handleMessage` to process these notifications and maintain a live registry of active windows in `sessionData`. This removes the need for polling to discover topology.

- 2025-12-28T17:50:27Z @tobiu closed this issue
- 2025-12-28T18:15:55Z @tobiu referenced in commit `21b8247` - "feat(ai): Implement Neural Link healing and standardize routing (#8169)

- Refactor API: Rename windowId to sessionId for clarity (#8174)
- Feat: Implement window connect/disconnect notifications (#8175)
- Feat: Add state rehydration on reconnect (#8176)
- Update Client to track lifecycle and sync topology
- Update ConnectionService to cache window state and serve topology instantly"

