---
id: 8016
title: Harden Neural Link MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-03T22:17:31Z'
updatedAt: '2025-12-28T18:37:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8016'
author: tobiu
commentsCount: 2
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T18:37:50Z'
---
# Harden Neural Link MCP Server

The Neural Link MCP Server requires hardening to match the standards set by `memory-core`.

**Requirements:**
1.  **HealthService:** Implement `HealthService.mjs` to monitor WebSocket server and `ConnectionService` status.
2.  **Server Enhancements:** Update `Server.mjs` to perform health checks during tool calls and startup.
3.  **Logging:** Add detailed startup and error logging.
4.  **OpenAPI:** Ensure `openapi.yaml` correctly defines all tools and is used for validation.

**Acceptance Criteria:**
-   Server reports health status on startup.
-   Tools fail gracefully if the server is unhealthy.
-   All tools are validated against OpenAPI specs.

## Timeline

- 2025-12-03T22:17:32Z @tobiu added the `enhancement` label
- 2025-12-03T22:17:32Z @tobiu added the `ai` label
### @tobiu - 2025-12-03T22:22:43Z

**Input from Antigravity:**

> ◆ **Clarification on Acceptance Criteria:**
> 
> The requirement "Server reports health status on startup" signifies that the server must output clear debugging logs to the console indicating its health status (e.g., "Neural Link MCP Server started", "Health Check Passed"). It does *not* imply a proactive push to the client unless the client explicitly requests a health check.

- 2025-12-28T13:39:04Z @tobiu added parent issue #8169
- 2025-12-28T18:18:14Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-28T18:37:30Z

**Input from Gemini 3.0:**

> ✦ I have completed the hardening of the Neural Link MCP Server.
> 
> **Summary of Changes:**
> 1.  **Health Service:** Implemented `HealthService.mjs` to monitor the WebSocket server and active connections, mirroring the `memory-core` architecture.
> 2.  **Server Lifecycle:** Updated `Server.mjs` to perform health checks on startup and gate tool execution (except for `healthcheck`) based on server health.
> 3.  **Connection Monitoring:** Enhanced `ConnectionService.mjs` with a `getStatus()` method to expose session and window counts.
> 4.  **OpenAPI Specs:** Significantly enhanced `openapi.yaml` with:
>     -   A new `/health` endpoint.
>     -   Detailed "When to Use" descriptions for all tools.
>     -   Logical tagging and improved schema definitions.
> 5.  **Tool Registration:** Registered the `healthcheck` tool in `toolService.mjs`.
> 
> The server now reports its health status on startup and provides a robust foundation for the upcoming Neural Link capabilities.

- 2025-12-28T18:37:50Z @tobiu closed this issue
- 2025-12-28T18:53:15Z @tobiu referenced in commit `7663897` - "feat(ai): Harden Neural Link MCP Server (#8016)

- Implement HealthService for WebSocket and session monitoring
- Add startup health checks and logging in Server.mjs
- Update ConnectionService to expose server status
- Enhance OpenAPI specs with health endpoint and detailed descriptions"

