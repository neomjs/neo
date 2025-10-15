---
title: Fix Gemini CLI Client Compatibility for MCP `tools/list` Response
labels: bug, AI
---

GH ticket id: #7498
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

The Gemini CLI client was unable to correctly parse the `tools/list` response from the `neo-github-workflow` MCP server due to strict validation rules and issues with `npm run` output. This ticket addresses these compatibility issues by adjusting the server's response format and startup command.

## Acceptance Criteria

1.  The `command` and `args` for `neo-github-workflow` in `.gemini/settings.json` are updated to directly invoke `node ai/mcp/server/github-workflow/mcp-stdio.mjs`, eliminating extraneous `npm run` output.
2.  `toolService.mjs` is modified to ensure that `outputSchema` is always a valid JSON Schema object, even for primitive types or when no schema is explicitly defined, by wrapping primitive types in an object schema and returning an empty object schema for undefined outputs.
3.  `toolService.mjs` is modified to omit the `nextCursor` field entirely from the `listTools` response when its value is `null`.
4.  `mcp-stdio.mjs` is modified to conditionally include `nextCursor` in the `tools/list` response only if it is not `undefined`.
5.  The Gemini CLI client successfully lists all tools from the `neo-github-workflow` server without errors.
