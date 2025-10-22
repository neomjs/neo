---
title: "Finalize MCP Server Config Refactoring"
labels: enhancement, refactoring, AI
---

GH ticket id: #7598

**Epic:** #7590
**Assignee:** tobiu
**Status:** Done

## Description

This ticket tracks the final steps of the MCP server configuration refactoring. The monolithic `ai/mcp/server/config.mjs` has been split into three new, server-specific configuration files:

- `ai/mcp/server/github-workflow/config.mjs`
- `ai/mcp/server/knowledge-base/config.mjs`
- `ai/mcp/server/memory-core/config.mjs`

This task is to update all server-side modules to import from their respective new config files and then to remove the old, monolithic config.

## Acceptance Criteria

1.  All modules within `ai/mcp/server/github-workflow/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
2.  All modules within `ai/mcp/server/knowledge-base/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
3.  All modules within `ai/mcp/server/memory-core/` that previously imported `../../config.mjs` are updated to import `./config.mjs`.
4.  The old `ai/mcp/server/config.mjs` file is deleted.
