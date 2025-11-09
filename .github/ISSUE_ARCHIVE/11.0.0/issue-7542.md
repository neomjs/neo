---
id: 7542
title: Convert healthService to HealthService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T12:49:46Z'
updatedAt: '2025-10-18T13:03:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7542'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T13:03:18Z'
---
# Convert healthService to HealthService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/memory-core/services/healthService.mjs` into a singleton class that extends `Neo.core.Base`. This service is responsible for providing the health status of the memory core server.

## Acceptance Criteria

1.  The `healthService.mjs` module is refactored into a `HealthService` class.
2.  The `HealthService` class extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `buildHealthResponse` function is converted into a class method.
4.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `HealthService` singleton and map its methods.
5.  Any other services that depend on `healthService` are updated to use the new `HealthService` singleton instance.
6.  The `neo-memory-core__healthcheck` tool continues to function correctly after the refactoring.

