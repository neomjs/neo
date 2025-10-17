---
title: Dynamically determine argument passing strategy from OpenAPI spec
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7519

**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

Currently, the shared `toolService.mjs` contains a hardcoded list of tool names that require their arguments to be passed as a single object to the handler function. This is brittle and not scalable.

This ticket is to refactor the `toolService` to determine the argument passing strategy dynamically from the OpenAPI specification for each tool. This will be achieved by introducing a custom OpenAPI extension field, `x-pass-as-object`.

## Acceptance Criteria

1.  A custom field, `x-pass-as-object: true`, is added to the OpenAPI specification for operations whose handlers expect a single arguments object.
2.  The `initializeToolMapping` function in `ai/mcp/server/toolService.mjs` is updated to read this flag and store it with the tool's definition.
3.  The `callTool` function is updated to use this flag to determine whether to pass arguments as a single object or as positional arguments.
4.  The hardcoded array of tool names is removed from `callTool`.
5.  All tool calls continue to function correctly for both MCP servers.
