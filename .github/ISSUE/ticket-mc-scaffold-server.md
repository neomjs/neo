---
title: "Scaffold Memory Core MCP Server"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7521

**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers the initial scaffolding of the new `memory-core` MCP server. The goal is to create the basic file structure and entry point for the server, consistent with the other MCP servers.

## Acceptance Criteria

1.  The `ai/mcp/server/memory` directory is renamed to `ai/mcp/server/memory-core`.
2.  A new `mcp-stdio.mjs` entry point file is created inside the `memory-core` directory.
3.  The new server is registered in `.gemini/settings.json`, and the old entry is removed.
