---
title: "Implement and Adopt a Centralized stderr Logger"
labels: enhancement, AI
---

GH ticket id: #7570

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

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
