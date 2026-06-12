---
id: 8216
title: Fix Neural Link server startup crash due to missing startServer/stopServer methods
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T11:14:25Z'
updatedAt: '2025-12-30T11:20:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8216'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T11:20:07Z'
---
# Fix Neural Link server startup crash due to missing startServer/stopServer methods

The Neural Link server crashes on startup because the `start_ws_server` and `stop_ws_server` tools are mapped to `ConnectionService.startServer` and `ConnectionService.stopServer`, which were not implemented in `ConnectionService` following the v2 architecture refactor.

**Root Cause:**
`toolService.mjs` attempts to bind these undefined methods during initialization (or tool list generation), causing a `TypeError`.

**Resolution:**
Implement `startServer()` and `stopServer()` in `ai/mcp/server/neural-link/services/ConnectionService.mjs`.
- `startServer()`: Should proxy to `this.ensureBridgeAndConnect()` (or `spawnBridge` explicitly).
- `stopServer()`: Should kill the child process (if managed) and close the WebSocket connection.

This maintains the v2 architecture (ConnectionService as a client to a standalone Bridge process) while restoring the functionality of the lifecycle management tools.


## Timeline

- 2025-12-30T11:14:26Z @tobiu added the `bug` label
- 2025-12-30T11:14:26Z @tobiu added the `ai` label
- 2025-12-30T11:14:37Z @tobiu assigned to @tobiu
- 2025-12-30T11:14:56Z @tobiu added parent issue #8169
- 2025-12-30T11:19:51Z @tobiu referenced in commit `ae5b10f` - "fix(ai): Implement start/stopServer in ConnectionService to resolve startup crash (#8216)"
- 2025-12-30T11:20:07Z @tobiu closed this issue

