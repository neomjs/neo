---
id: 7495
title: Add outputSchema to MCP Tool Definitions
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T11:44:17Z'
updatedAt: '2025-10-15T11:51:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7495'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-15T11:51:06Z'
---
# Add outputSchema to MCP Tool Definitions

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

The MCP `tools/list` response currently does not include the optional `outputSchema` for each tool. While optional, providing this schema will improve the tool definition's completeness and allow clients to better understand and validate the expected response structure.

This ticket covers the work to define the `outputSchema` using `zod`, based on the OpenAPI specification, and include its JSON Schema representation in the tool definitions.

## Acceptance Criteria

1.  `toolService.mjs` is refactored to define a `zod` schema for the successful response of each operation, based on the `responses` section of `openapi.yaml`.
2.  The `zod` schema is converted to a plain JSON Schema using a library like `zod-to-json-schema`.
3.  The generated JSON Schema is added as the `outputSchema` property to each tool definition returned by `listTools`.
4.  The `tools/list` response is verified to include the new `outputSchema` for each tool.

