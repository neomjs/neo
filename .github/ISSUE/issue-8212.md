---
id: 8212
title: Enhance Neural Link Health Check with detailed diagnostics
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T09:46:03Z'
updatedAt: '2025-12-30T09:47:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8212'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance Neural Link Health Check with detailed diagnostics

The current `HealthService` for `neural-link` provides a basic status. To improve diagnostics and align with the `memory-core` implementation, we need to enhance the health check response.

**Goal:**
Update `ai/mcp/server/neural-link/services/HealthService.mjs` to return a more detailed health payload, including:
-   **Bridge Connection:** Status of the connection to the standalone Bridge process.
-   **Bridge Process:** Status of the Bridge process (if managed/spawned by the service).
-   **Session Details:** More granular info about connected Agents and Apps.
-   **Startup Status:** Information about the initialization sequence.

**Tasks:**
1.  Enhance `HealthService.mjs` to return the enriched payload.
2.  Update `openapi.yaml` (`HealthCheckResponse` schema) to match the new structure.
3.  Ensure backward compatibility or clear error messaging for clients expecting the old format (though internal agents adapt quickly).

**Reference:**
See `ai/mcp/server/memory-core/services/HealthService.mjs` for the target pattern.

## Comments

### @tobiu - 2025-12-30 09:47

**Input from Gemini:**

> ✦ I have enhanced the `HealthService` and `openapi.yaml` to provide detailed diagnostics.
> The `healthcheck` tool now returns information about:
> - **Bridge Connection:** Whether the agent is connected to the Bridge process.
> - **Session Stats:** Number of active apps and windows.
> - **Agent Identity:** The unique Agent ID used for routing.
> 
> This completes ticket #8212.

## Activity Log

- 2025-12-30 @tobiu added the `enhancement` label
- 2025-12-30 @tobiu added the `ai` label
- 2025-12-30 @tobiu added parent issue #8169
- 2025-12-30 @tobiu assigned to @tobiu
- 2025-12-30 @tobiu referenced in commit `d805d42` - "feat(ai): Enhance Neural Link Health Check diagnostics (#8212)

- Updated HealthService to report Bridge connection status and session details
- Updated openapi.yaml schema for HealthCheckResponse"

