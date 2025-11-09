---
id: 7534
title: Implement Centralized Logger for MCP Servers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T09:11:41Z'
updatedAt: '2025-10-18T09:18:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7534'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T09:18:30Z'
---
# Implement Centralized Logger for MCP Servers

**Reported by:** @tobiu on 2025-10-18

The Model Context Protocol (MCP) servers are designed to communicate over stdio using JSON-RPC. Direct logging to `stdout` with `console.log` corrupts the message stream and breaks the server. While `stderr` is safe for error logging, standard diagnostic logs need to be conditional.

This ticket is to implement a centralized, debug-flag-aware logger to manage `stdout` logging across all MCP servers and refactor existing code to use it.

## Acceptance Criteria

1.  A global `debug` flag is added to `ai/mcp/server/config.mjs`, defaulting to `false`.
2.  A new logger module is created at `ai/mcp/server/logger.mjs`.
3.  The logger module only outputs to `console.log` when the `debug` flag in `aiConfig` is `true`.
4.  All existing `console.log` statements in the `knowledge-base` and `memory-core` MCP server files are refactored to use the new logger module.
5.  `console.error` statements are not affected and should remain as they are for logging to `stderr`.

