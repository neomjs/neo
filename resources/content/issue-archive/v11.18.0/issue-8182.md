---
id: 8182
title: 'Feat: Neural Link Identity and Recovery'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T19:37:23Z'
updatedAt: '2025-12-28T19:48:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8182'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T19:48:27Z'
---
# Feat: Neural Link Identity and Recovery

Enhance `Neural Link` connection logic to support session recovery via a persistent `appWorkerId`.

**Client-Side (`src/ai/Client.mjs`):**
1.  Append `?appWorkerId=${Neo.worker.App.id}` to the WebSocket URL.
2.  This allows the server to identify the connection immediately.

**Server-Side (`ai/mcp/server/neural-link/services/ConnectionService.mjs`):**
1.  Parse the `appWorkerId` from the request URL in `handleConnection`.
2.  Use `appWorkerId` as the primary key for the session map (or map it to the sessionId).
3.  If a connection with the same `appWorkerId` exists, disconnect the old one and replace it with the new one (handling reconnection).
4.  Update `call()` logic to wait/retry if the session is temporarily offline but has a known `appWorkerId`.

**Goal:** Ensure the MCP server can recover from network blips or client reloads without losing the logical session identity.

## Timeline

- 2025-12-28T19:37:23Z @tobiu added the `enhancement` label
- 2025-12-28T19:37:24Z @tobiu added the `ai` label
- 2025-12-28T19:40:18Z @tobiu assigned to @tobiu
- 2025-12-28T19:47:57Z @tobiu referenced in commit `1a6dd51` - "feat(ai): Neural Link Identity and Recovery (#8182)

- Updated Client.mjs to send appWorkerId as query param
- Updated ConnectionService to use appWorkerId as session key
- Implemented call recovery with waitForSession"
### @tobiu - 2025-12-28T19:48:07Z

**Input from Gemini 3.0:**

> ✦ I have implemented the resilience and identity enhancements.
> 
> **Key Changes:**
> 1.  **Persistent Identity:** `Neo.ai.Client` now appends `?appWorkerId=...` to the WebSocket connection URL.
> 2.  **Session Mapping:** `ConnectionService` uses this `appWorkerId` as the stable `sessionId` key. This allows the server to recognize re-connections from the same application instance.
> 3.  **Call Recovery:** `ConnectionService.call()` now gracefully handles missing sessions by entering a `waitForSession` state.
> 4.  **Auto-Start:** If the server is not running when a call is attempted, it automatically starts, allowing for recovery from server crashes or stops.
> 
> The Neural Link is now robust against network interruptions and server restarts.

- 2025-12-28T19:48:27Z @tobiu closed this issue
- 2025-12-28T21:40:27Z @tobiu added parent issue #8169

