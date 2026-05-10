---
id: 7570
title: Implement and Adopt a Centralized stderr Logger
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:16:16Z'
updatedAt: '2025-10-20T12:30:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7570'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T12:30:12Z'
---
# Implement and Adopt a Centralized stderr Logger

The MCP server specification requires that `stdio`-based servers **must not** write to `stdout`, as it will corrupt the JSON-RPC message transport. Currently, the `SyncService` and other parts of the server use `console.log`, `console.warn`, and `console.error` directly, with some writing to `stdout`.

This ticket covers the enhancement of the existing `logger.mjs` to provide a safe, centralized logging mechanism that exclusively uses `stderr`, and the refactoring of our services to adopt it.

## Acceptance Criteria

1.  The `ai/mcp/server/logger.mjs` file is updated to provide `debug`, `info`, `warn`, and `error` methods.
2.  All methods within the logger **must** use `console.error` to ensure output is directed to `stderr`.
3.  All logging methods (`debug`, `info`, `warn`, `error`) must be conditional and only log when `aiConfig.debug` is `true`.
4.  The `SyncService.mjs` is refactored to import and use the new logger for all its console output.
    - `console.log` should be replaced with `logger.info` or `logger.debug`.
    - `console.warn` should be replaced with `logger.warn`.
    - `console.error` should be replaced with `logger.error`.
5.  The main server entry point, `ai/mcp/server/github-workflow/mcp-stdio.mjs`, is also refactored to use the new logger.

## Benefits

-   **Bug Fix:** Prevents corruption of the `stdio` message transport, ensuring server stability.
-   **Compliance:** Adheres to the MCP server specification.
-   **Centralized Logging:** Provides a single, consistent, and safe way to handle logging across all services.
-   **Improved Diagnostics:** Prefixes logs with `[INFO]`, `[WARN]`, etc., making `stderr` output easier to read and filter.

## Timeline

- 2025-10-20T12:16:16Z @tobiu assigned to @tobiu
- 2025-10-20T12:16:17Z @tobiu added the `enhancement` label
- 2025-10-20T12:16:17Z @tobiu added the `ai` label
- 2025-10-20T12:16:17Z @tobiu added parent issue #7564
- 2025-10-20T12:30:12Z @tobiu closed this issue

