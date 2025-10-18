---
title: Enhance MCP ToolService to Support OpenAPI Keywords
labels: enhancement, AI
---

GH ticket id: #7535

**Assignee:** tobiu
**Status:** Done

## Description

The `ai/mcp/server/toolService.mjs` is responsible for parsing OpenAPI specifications and generating Zod schemas for validating tool inputs and outputs. The current implementation of `buildZodSchemaFromResponse` is too simplistic and does not support common OpenAPI keywords like `oneOf`, `required`, and `nullable`. This leads to schema validation errors when the OpenAPI spec uses these features.

This ticket is to enhance the `buildZodSchemaFromResponse` function to correctly handle these keywords, making the tool service more robust and compliant with the OpenAPI specification.

## Acceptance Criteria

1.  The `buildZodSchemaFromResponse` function in `ai/mcp/server/toolService.mjs` is updated to handle the `oneOf` keyword by mapping it to Zod's `z.union`.
2.  The function is updated to handle the `required` keyword for object properties, making properties optional in the Zod schema if they are not in the `required` list.
3.  The function is updated to handle `nullable: true` by applying `.nullable()` to the Zod schema.
4.  The `openapi.yaml` for the memory-core server is simplified to use `nullable: true` for the `pid` property, removing the need for complex `oneOf` constructs.
5.  The `neo-memory-core__healthcheck` tool passes successfully with these changes.
