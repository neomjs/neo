---
id: 7587
title: Implement Graceful Health Handling with Recovery
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T20:47:04Z'
updatedAt: '2025-10-20T21:24:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7587'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T21:24:30Z'
---
# Implement Graceful Health Handling with Recovery

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

Enhance the HealthService with transparent caching and update the MCP server
startup to handle unhealthy states gracefully.

## Acceptance Criteria

### HealthService Changes:
1. Add private caching fields: `#cachedHealth`, `#lastCheckTime`, `#cacheDuration`
2. Refactor current `healthcheck()` logic into `#performHealthCheck()`
3. Update `healthcheck()` to use cache (5 min TTL) before calling `#performHealthCheck()`
4. Add `ensureHealthy()` method that throws if status is 'unhealthy'
5. No changes to OpenAPI spec (caching is transparent)

### MCP Server Changes:
6. Update `mcp-stdio.mjs` startup:
   - Call `healthcheck()` on startup
   - If unhealthy: log warnings but **don't abort**
   - Inform user server will continue but tools may fail

7. Update tool call handler:
   - Call `HealthService.ensureHealthy()` before `callTool()`
   - Catch and return error to agent if unhealthy
   - Use cached result (minimal overhead)

## Benefits

- Performance: Avoids redundant health checks
- Resilience: Server doesn't crash on startup if `gh` missing
- Recovery: User can run `gh auth login` and tools will work
- UX: Clear errors guide users to fix issues

