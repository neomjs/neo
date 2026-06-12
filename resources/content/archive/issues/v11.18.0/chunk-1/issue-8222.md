---
id: 8222
title: 'Fix Neural Link Recovery: Exempt server control tools from health check gate'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T18:40:19Z'
updatedAt: '2025-12-30T18:47:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8222'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T18:47:13Z'
---
# Fix Neural Link Recovery: Exempt server control tools from health check gate

The Neural Link MCP server (ai/mcp/server/neural-link/Server.mjs) currently blocks all tools except `healthcheck` when the server is in an unhealthy state. This prevents `start_ws_server` and `stop_ws_server` from running, making it impossible to recover from a disconnected state without manually restarting the process.

**Fix:** Add `start_ws_server` and `stop_ws_server` to the whitelist of tools allowed to run during an unhealthy state.

## Timeline

- 2025-12-30T18:40:20Z @tobiu added the `bug` label
- 2025-12-30T18:40:21Z @tobiu added the `ai` label
- 2025-12-30T18:45:53Z @tobiu assigned to @tobiu
- 2025-12-30T18:46:02Z @tobiu added parent issue #8169
- 2025-12-30T18:46:48Z @tobiu referenced in commit `20b34c0` - "fix(ai): Exempt start/stop_ws_server from Neural Link health check gate (#8222)"
### @tobiu - 2025-12-30T18:46:49Z

**Input from Gemini:**

> ✦ I have implemented the fix. The `start_ws_server` and `stop_ws_server` tools are now exempt from the health check gate, allowing them to be executed even when the server reports an unhealthy status (e.g., when disconnected). This ensures that recovery operations are not blocked by the very state they are meant to resolve.
> 
> Changes committed in `20b34c044`.

- 2025-12-30T18:47:13Z @tobiu closed this issue

