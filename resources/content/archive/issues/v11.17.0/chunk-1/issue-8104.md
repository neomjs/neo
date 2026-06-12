---
id: 8104
title: '[MCP] Harden HealthServices with Request Deduplication'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-13T13:15:08Z'
updatedAt: '2025-12-13T13:25:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8104'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T13:25:49Z'
---
# [MCP] Harden HealthServices with Request Deduplication

### Objective
Implement request deduplication (in-flight promise caching) in the HealthService for both `memory-core` and `knowledge-base` MCP servers.

### Description
To prevent "thundering herd" race conditions where multiple concurrent callers (e.g., Server initialization and Service initialization) trigger parallel, redundant health checks during startup, we need to cache the pending health check promise. This pattern was successfully implemented in the `github-workflow` server and should be standardized across all MCP servers.

### Implementation Details
For both:
- `ai/mcp/server/memory-core/services/HealthService.mjs`
- `ai/mcp/server/knowledge-base/services/HealthService.mjs`

1.  Add a private field `#healthCheckPromise = null;`.
2.  Update `healthcheck()` method:
    -   Check if `#healthCheckPromise` exists. If so, return it.
    -   If not, assign `this.#performHealthCheck().finally(...)` to it.
    -   Ensure the promise is cleared (set to null) in the `finally` block.


## Timeline

- 2025-12-13T13:15:09Z @tobiu added the `enhancement` label
- 2025-12-13T13:15:09Z @tobiu added the `ai` label
- 2025-12-13T13:24:29Z @tobiu assigned to @tobiu
- 2025-12-13T13:24:50Z @tobiu referenced in commit `6eaf60c` - "[MCP] Harden HealthServices with Request Deduplication #8104"
### @tobiu - 2025-12-13T13:25:03Z

**Input from gemini:**

> ✦ I have implemented request deduplication in the `HealthService` for both `memory-core` and `knowledge-base`.
> 
> **Changes:**
> 1.  **Memory Core** (`ai/mcp/server/memory-core/services/HealthService.mjs`):
>     -   Added `#healthCheckPromise` private field.
>     -   Updated `healthcheck()` to return `await this.#healthCheckPromise` if a check is already in progress, ensuring the existing error handling wrapper is respected.
>     -   Ensured the promise is cleared in a `finally` block.
> 
> 2.  **Knowledge Base** (`ai/mcp/server/knowledge-base/services/HealthService.mjs`):
>     -   Added `#healthCheckPromise` private field.
>     -   Updated `healthcheck()` to return `this.#healthCheckPromise` if a check is already in progress.
>     -   Ensured the promise is cleared in a `finally` block.
> 
> This prevents race conditions during startup where multiple services could trigger redundant health checks simultaneously.
> 

- 2025-12-13T13:25:50Z @tobiu closed this issue

