---
id: 7535
title: Enhance MCP ToolService to Support OpenAPI Keywords
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T09:40:02Z'
updatedAt: '2025-10-18T10:08:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7535'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T10:08:10Z'
---
# Enhance MCP ToolService to Support OpenAPI Keywords

**Reported by:** @tobiu on 2025-10-18

The `ai/mcp/server/toolService.mjs` is responsible for parsing OpenAPI specifications and generating Zod schemas for validating tool inputs and outputs. The current implementation of `buildZodSchemaFromResponse` is too simplistic and does not support common OpenAPI keywords like `oneOf`, `required`, and `nullable`. This leads to schema validation errors when the OpenAPI spec uses these features.

This ticket is to enhance the `buildZodSchemaFromResponse` function to correctly handle these keywords, making the tool service more robust and compliant with the OpenAPI specification.

## Acceptance Criteria

1.  The `buildZodSchemaFromResponse` function in `ai/mcp/server/toolService.mjs` is updated to handle the `oneOf` keyword by mapping it to Zod's `z.union`.
2.  The function is updated to handle the `required` keyword for object properties, making properties optional in the Zod schema if they are not in the `required` list.
3.  The function is updated to handle `nullable: true` by applying `.nullable()` to the Zod schema.
4.  The `openapi.yaml` for the memory-core server is simplified to use `nullable: true` for the `pid` property, removing the need for complex `oneOf` constructs.
5.  The `neo-memory-core__healthcheck` tool passes successfully with these changes.

## Comments

### @tobiu - 2025-10-18 10:08

resolved via https://github.com/neomjs/neo/commit/e272eb7bb355091d08b7fac278a1cd7f3850a85e (used the wrong ticket id for the commit)

