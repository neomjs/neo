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
blockedBy: []
blocking: []
closedAt: '2025-10-20T21:24:30Z'
---
# Implement Graceful Health Handling with Recovery

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

## Timeline

- 2025-10-20T20:47:05Z @tobiu assigned to @tobiu
- 2025-10-20T20:47:06Z @tobiu added the `enhancement` label
- 2025-10-20T20:47:06Z @tobiu added the `ai` label
- 2025-10-20T20:47:06Z @tobiu added parent issue #7564
- 2025-10-20T21:22:15Z @tobiu referenced in commit `29682a3` - "Implement Graceful Health Handling with Recovery #7587"
- 2025-10-20T21:24:26Z @tobiu referenced in commit `4bba916` - "#7587 ticket md file update"
- 2025-10-20T21:24:30Z @tobiu closed this issue

