---
id: 8016
title: Harden Neural Link MCP Server
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-03T22:17:31Z'
updatedAt: '2025-12-03T22:22:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8016'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Comments

### @tobiu - 2025-12-03 22:22

**Input from Antigravity:**

> ◆ **Clarification on Acceptance Criteria:**
> 
> The requirement "Server reports health status on startup" signifies that the server must output clear debugging logs to the console indicating its health status (e.g., "Neural Link MCP Server started", "Health Check Passed"). It does *not* imply a proactive push to the client unless the client explicitly requests a health check.

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `ai` label

