---
id: 7553
title: Refactor HealthService to Match Superior Memory Core Pattern
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T21:54:38Z'
updatedAt: '2025-10-19T22:07:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7553'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T22:07:30Z'
---
# Refactor HealthService to Match Superior Memory Core Pattern

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/healthService.mjs` into a singleton `HealthService` class. The current implementation is a simple function; it should be upgraded to match the more robust and informative pattern established in the `memory-core` server's `HealthService` (`ai/mcp/server/memory-core/services/HealthService.mjs`).

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/healthService.mjs` is renamed to `HealthService.mjs`.
2.  The content is replaced with a `HealthService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The `healthcheck` function is converted into a class method (e.g., `buildHealthResponse`).
4.  The new class uses the `DatabaseLifecycleService` and `ChromaManager` to get the database status, instead of creating its own Chroma client.
5.  The health check response is enhanced to include more details, such as uptime and version, mirroring the `memory-core` service.
6.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to use the new `HealthService` class and its method.
7.  The `healthcheck` tool continues to function correctly with the improved response structure.

## Timeline

- 2025-10-19T21:54:38Z @tobiu assigned to @tobiu
- 2025-10-19T21:54:39Z @tobiu added the `enhancement` label
- 2025-10-19T21:54:39Z @tobiu added the `ai` label
- 2025-10-19T21:54:40Z @tobiu added parent issue #7536
- 2025-10-19T21:58:53Z @tobiu referenced in commit `ab3924a` - "Refactor HealthService to Match Superior Memory Core Pattern #7553"
- 2025-10-19T22:07:30Z @tobiu closed this issue

