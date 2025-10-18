---
title: Implement Centralized Logger for MCP Servers
labels: enhancement, AI
---

GH ticket id: #(TBD)

**Epic:** Architect AI Tooling as MCP
**Assignee:** tobiu
**Status:** Done

## Description

The Model Context Protocol (MCP) servers are designed to communicate over stdio using JSON-RPC. Direct logging to `stdout` with `console.log` corrupts the message stream and breaks the server. While `stderr` is safe for error logging, standard diagnostic logs need to be conditional.

This ticket is to implement a centralized, debug-flag-aware logger to manage `stdout` logging across all MCP servers and refactor existing code to use it.

## Acceptance Criteria

1.  A global `debug` flag is added to `ai/mcp/server/config.mjs`, defaulting to `false`.
2.  A new logger module is created at `ai/mcp/server/logger.mjs`.
3.  The logger module only outputs to `console.log` when the `debug` flag in `aiConfig` is `true`.
4.  All existing `console.log` statements in the `knowledge-base` and `memory-core` MCP server files are refactored to use the new logger module.
5.  `console.error` statements are not affected and should remain as they are for logging to `stderr`.
