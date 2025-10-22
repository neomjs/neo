---
id: 7583
title: Implement Abort-on-Startup if Health Check Fails
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:37:08Z'
updatedAt: '2025-10-20T13:44:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7583'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T13:44:37Z'
---
# Implement Abort-on-Startup if Health Check Fails

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

To ensure the `github-workflow` server is always in a valid state, it should perform a comprehensive health check upon startup and refuse to run if its critical dependencies are not met. This prevents any tool from executing in a broken environment.

This will be achieved by leveraging the existing `HealthService`.

## Acceptance Criteria

1.  The `main()` function in `ai/mcp/server/github-workflow/mcp-stdio.mjs` is updated.
2.  It must import the `HealthService`.
3.  Before the server connects to the transport, it must call `HealthService.healthcheck()`.
4.  It must inspect the response payload from the health check.
5.  If `payload.status` is `'unhealthy'`, the server must:
    a. Log a clear error message to `stderr` indicating that the server is aborting.
    b. Log the detailed reasons for the failure from `payload.githubCli.details`.
    c. Terminate the process with a non-zero exit code (e.g., `process.exit(1)`).

## Benefits

-   **Fail-Fast Principle:** The server aborts immediately if its dependencies (like `gh` CLI) are not correctly installed, authenticated, and versioned.
-   **Robustness:** Prevents any tool from being called when the server is in an invalid state.
-   **Clear Errors:** Provides immediate, actionable feedback to the user if their environment is not configured correctly.
-   **DRY:** Reuses the existing, comprehensive logic in `HealthService` instead of duplicating checks.

