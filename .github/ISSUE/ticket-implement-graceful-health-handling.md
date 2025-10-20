---
title: "Implement Graceful Health Handling with Recovery"
labels: enhancement, AI
---

GH ticket id: #7587

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

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
- Recovery: User can run `gh auth login` and tools will work (via cache expiry)
- UX: Clear errors guide users to fix issues
