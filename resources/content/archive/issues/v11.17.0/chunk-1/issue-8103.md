---
id: 8103
title: '[GitHub Workflow] Add syncOnStartup configuration'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-13T12:46:10Z'
updatedAt: '2025-12-13T13:06:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8103'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T13:06:23Z'
---
# [GitHub Workflow] Add syncOnStartup configuration

### Objective
Add a `syncOnStartup` configuration option to the GitHub Workflow MCP server to automatically trigger a full sync when the server starts. This includes hardening the `HealthService` to handle concurrent checks during the chaotic startup phase.

### Description
The GitHub Workflow server needs to sync issues on startup to ensure a fresh cache. Since both the `Server` and the `SyncService` will need to check system health during initialization, we must ensure they don't race and trigger parallel, redundant `gh` CLI processes.

### Implementation Details
1.  **Config**: Add `syncOnStartup: true` to `ai/mcp/server/github-workflow/config.mjs`.

2.  **HealthService** (`ai/mcp/server/github-workflow/services/HealthService.mjs`):
    -   Implement **In-Flight Deduplication**:
        -   Add a private field (e.g., `#healthCheckPromise`) to store the pending check.
        -   In `healthcheck()`, if a check is in progress, return the existing promise.
        -   If not, start `this.#performHealthCheck()`, store the promise, and clear it upon completion/failure.

3.  **SyncService** (`ai/mcp/server/github-workflow/services/SyncService.mjs`):
    -   Implement `initAsync()`.
    -   Check `aiConfig.syncOnStartup`.
    -   Call `await HealthService.healthcheck()`.
    -   **Condition**:
        -   If `status === 'healthy'`: Call `await this.runFullSync()`.
        -   If `status !== 'healthy'`: Log a warning ("Skipping startup sync: GitHub CLI unhealthy") and return.
    -   **Safety**: Wrap in `try/catch` to prevent service crash on sync failure.

4.  **Server** (`ai/mcp/server/github-workflow/Server.mjs`):
    -   Import `SyncService`.
    -   In `initAsync`, add `await SyncService.ready()` **after** the server's own health check. This ensures strict ordering: Server verifies environment -> SyncService completes (synced or skipped) -> Server opens for business.


## Timeline

- 2025-12-13T12:46:12Z @tobiu added the `enhancement` label
- 2025-12-13T12:46:12Z @tobiu added the `ai` label
- 2025-12-13T12:52:16Z @tobiu assigned to @tobiu
- 2025-12-13T13:02:57Z @tobiu referenced in commit `41a686e` - "[GitHub Workflow] Add syncOnStartup configuration #8103"
### @tobiu - 2025-12-13T13:04:30Z

**Input from gemini:**

> ✦ I have successfully implemented the `syncOnStartup` feature and hardened the startup sequence.
> 
> **Changes:**
> 1.  **Config:** Added `syncOnStartup: true` to `ai/mcp/server/github-workflow/config.mjs`.
> 2.  **HealthService:** Implemented **In-Flight Deduplication** for `healthcheck()`. This prevents the "thundering herd" problem where multiple services (Server & SyncService) trigger parallel `gh` CLI calls during startup.
> 3.  **SyncService:** Added `initAsync()` logic to trigger `runFullSync()` on startup *only* if the system is healthy. It includes a try-catch block to ensure the service initializes even if the sync fails (e.g. network issues).
> 4.  **Server:** Updated `initAsync()` to `await SyncService.ready()`. This ensures the server waits for the cache to be populated (or the attempt to finish) before accepting MCP tool requests.
> 
> The server is now robust against race conditions and will automatically keep the issue cache fresh.
> 

- 2025-12-13T13:06:23Z @tobiu closed this issue

