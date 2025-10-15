---
title: Add outputSchema to MCP Tool Definitions
labels: enhancement, AI
---

GH ticket id: #7495
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The MCP `tools/list` response currently does not include the optional `outputSchema` for each tool. While optional, providing this schema will improve the tool definition's completeness and allow clients to better understand and validate the expected response structure.

This ticket covers the work to define the `outputSchema` using `zod`, based on the OpenAPI specification, and include its JSON Schema representation in the tool definitions.

## Acceptance Criteria

1.  `toolService.mjs` is refactored to define a `zod` schema for the successful response of each operation, based on the `responses` section of `openapi.yaml`.
2.  The `zod` schema is converted to a plain JSON Schema using a library like `zod-to-json-schema`.
3.  The generated JSON Schema is added as the `outputSchema` property to each tool definition returned by `listTools`.
4.  The `tools/list` response is verified to include the new `outputSchema` for each tool.
