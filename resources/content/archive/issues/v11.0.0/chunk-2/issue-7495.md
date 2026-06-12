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
blockedBy: []
blocking: []
closedAt: '2025-10-15T11:51:06Z'
---
# Add outputSchema to MCP Tool Definitions

The MCP `tools/list` response currently does not include the optional `outputSchema` for each tool. While optional, providing this schema will improve the tool definition's completeness and allow clients to better understand and validate the expected response structure.

This ticket covers the work to define the `outputSchema` using `zod`, based on the OpenAPI specification, and include its JSON Schema representation in the tool definitions.

## Acceptance Criteria

1.  `toolService.mjs` is refactored to define a `zod` schema for the successful response of each operation, based on the `responses` section of `openapi.yaml`.
2.  The `zod` schema is converted to a plain JSON Schema using a library like `zod-to-json-schema`.
3.  The generated JSON Schema is added as the `outputSchema` property to each tool definition returned by `listTools`.
4.  The `tools/list` response is verified to include the new `outputSchema` for each tool.

## Timeline

- 2025-10-15T11:44:17Z @tobiu assigned to @tobiu
- 2025-10-15T11:44:19Z @tobiu added the `enhancement` label
- 2025-10-15T11:44:19Z @tobiu added parent issue #7477
- 2025-10-15T11:44:20Z @tobiu added the `ai` label
- 2025-10-15T11:50:53Z @tobiu referenced in commit `85094ca` - "Add outputSchema to MCP Tool Definitions #7495"
- 2025-10-15T11:51:06Z @tobiu closed this issue

