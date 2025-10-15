---
title: Refine `mcp-stdio.mjs` for MCP Compliance and Clarity
labels: enhancement, AI, MCP, cleanup
---

GH ticket id: #
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The `ai/mcp/server/github-workflow/mcp-stdio.mjs` file can be improved for better compliance with the MCP specification and clarity. Specifically, the `tools/list` response should fully conform to `ToolSchema`, and the server capabilities should be explicitly defined.

## Acceptance Criteria

1.  The `capabilities.tools` object in the server initialization is updated to explicitly state `listChanged: false`.
2.  The `mcpTools` mapping within the `ListToolsRequestSchema` handler is updated to include `title`, `outputSchema`, and `annotations` from the `tool` object returned by `listTools`.
3.  The comment "// Convert from your format to MCP format" is removed or updated to be more accurate.
