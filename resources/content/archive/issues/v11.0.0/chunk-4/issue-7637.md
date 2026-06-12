---
id: 7637
title: 'Fix: Race condition in async service initialization'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T08:21:56Z'
updatedAt: '2025-10-25T08:51:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7637'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T08:51:33Z'
---
# Fix: Race condition in async service initialization

There is a race condition during the startup of MCP servers (e.g., `memory-core`) that rely on singleton services with asynchronous initialization.

**Problem:**
- The main server entry point (`mcp-stdio.mjs`) imports services at startup.
- Services like `ChromaManager` extend `core.Base` and perform async setup (like database connections) in `initAsync()`.
- `core.Base` calls `initAsync()` in a non-blocking way from the `construct()` method.
- Other services (e.g., `HealthService`) are called immediately in the startup sequence, before `initAsync()` is guaranteed to have completed, leading to failed checks and incorrect "unhealthy" status reports.

**Solution:**
Enhance `Neo.core.Base` to provide a standardized and reliable way to await the completion of an instance's asynchronous initialization.

1.  **Introduce an awaitable `ready()` method to `Neo.core.Base`:**
    -   Add private `#readyPromise` and `#readyResolver` fields to `core.Base`.
    -   In the `construct()` method, initialize the promise.
    -   Add a public `ready()` method that returns this promise.

2.  **Centralize Ready Logic in `afterSetIsReady`:**
    -   Create an `afterSetIsReady(value, oldValue)` hook in `core.Base`.
    -   When `isReady` becomes `true`, this hook will:
        -   Resolve the `#readyPromise`.
        -   For observable classes (`static observable = true`), fire a `ready` event, passing the instance as the payload.
    -   Update the JSDoc for the `isReady_` config to reflect this new behavior.

3.  **Refactor consumers:**
    -   Update `ai/mcp/server/memory-core/mcp-stdio.mjs` to use `await ChromaManager.ready()` before performing the initial health check.

This change will provide a clean, reusable, and framework-aligned solution for managing async initialization in Neo.mjs classes.

## Timeline

- 2025-10-25T08:50:53Z @tobiu assigned to @tobiu
- 2025-10-25T08:51:01Z @tobiu added the `bug` label
- 2025-10-25T08:51:01Z @tobiu added the `ai` label
- 2025-10-25T08:51:26Z @tobiu referenced in commit `0b1bc90` - "Fix: Race condition in async service initialization #7637"
- 2025-10-25T08:51:33Z @tobiu closed this issue

