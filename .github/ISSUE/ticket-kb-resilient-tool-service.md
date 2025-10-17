---
title: Make toolService resilient to server-prefixed tool names
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7518

**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

The Gemini CLI disambiguates tool name collisions from different MCP servers by prefixing the tool name with the server name (e.g., `neo-knowledge-base__healthcheck`). This causes `callTool` to fail, as it looks for the exact prefixed name in the `serviceMapping`.

This ticket is to make the `callTool` function in the shared `toolService.mjs` resilient to this behavior.

## Acceptance Criteria

1.  The `callTool` function in `ai/mcp/server/toolService.mjs` is modified.
2.  The function checks if the incoming `toolName` contains `__`.
3.  If it does, it uses the substring after the last `__` as the effective tool name for lookup.
4.  Tool calls with prefixed names now execute correctly.
5.  Tool calls with non-prefixed names continue to work as before.
