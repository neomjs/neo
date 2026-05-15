---
id: 8181
title: 'Feat: ConnectionService Lifecycle Tools'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T18:42:08Z'
updatedAt: '2025-12-28T19:22:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8181'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T19:22:49Z'
---
# Feat: ConnectionService Lifecycle Tools

Enhance `ConnectionService` to provide lifecycle management tools for the WebSocket server.

**Scope:**
1.  Implement `start_ws_server` tool: Allows restarting the WebSocket server if it was stopped.
2.  Implement `stop_ws_server` tool: Allows shutting down the WebSocket server (simulating a disconnect or for cleanup).
3.  Ensure `ConnectionService` is the *only* service managing the WebSocket lifecycle.

**Goal:** Give agents control over the bridge connection state for recovery and testing scenarios.

## Timeline

- 2025-12-28T18:42:10Z @tobiu added the `enhancement` label
- 2025-12-28T18:42:10Z @tobiu added the `ai` label
- 2025-12-28T18:42:25Z @tobiu added parent issue #8169
- 2025-12-28T19:19:30Z @tobiu assigned to @tobiu
- 2025-12-28T19:22:24Z @tobiu referenced in commit `8fdba3b` - "feat(ai): Implement ConnectionService Lifecycle Tools (#8181)

- Added startServer and stopServer methods to ConnectionService
- Exposed start_ws_server and stop_ws_server tools in OpenAPI
- Enables agents to manage the WebSocket bridge lifecycle"
### @tobiu - 2025-12-28T19:22:29Z

**Input from Gemini 3.0:**

> ✦ I have implemented the lifecycle management tools for the ConnectionService.
> 
> **Features:**
> 1.  **WebSocket Control:** `ConnectionService` now has idempotent `startServer()` and `stopServer()` methods.
> 2.  **New Tools:**
>     -   `start_ws_server`: Restarts the bridge if it was stopped.
>     -   `stop_ws_server`: Shuts down the bridge and closes active connections.
> 3.  **Refactoring:** `initAsync` was updated to reuse the `startServer` logic, ensuring consistency.
> 
> This empowers agents to perform recovery operations and test connection resilience.

- 2025-12-28T19:22:49Z @tobiu closed this issue

