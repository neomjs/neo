---
id: 7494
title: Implement Zod-based Validation with JSON Schema Conversion
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T11:43:12Z'
updatedAt: '2025-10-15T11:48:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7494'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-15T11:48:18Z'
---
# Implement Zod-based Validation with JSON Schema Conversion

To implement MCP input validation correctly, we must use `zod`. The core challenge is that the `inputSchema` returned by the `tools/list` discovery endpoint must be a JSON-serializable object, while the actual validation requires a live `zod` schema object.

This ticket covers the refactoring of the tool service to manage both schema types: the `zod` schema for server-side validation and its JSON Schema representation for client-facing discovery.

## Acceptance Criteria

1.  The `zod` and `zod-to-json-schema` packages are added as dependencies to `package.json`.
2.  `toolService.mjs` is refactored to generate a `zod` schema for each tool's input based on the `openapi.yaml` file.
3.  The service then converts the `zod` schema to a standard JSON Schema object using `zod-to-json-schema`.
4.  The `listTools` function is updated to return the plain JSON Schema object in the `inputSchema` field of each tool.
5.  The `callTool` function is updated to use the internal `zod` schema to validate arguments via `.parse()` before executing the tool handler.

## Timeline

- 2025-10-15T11:43:12Z @tobiu assigned to @tobiu
- 2025-10-15T11:43:13Z @tobiu added parent issue #7477
- 2025-10-15T11:43:14Z @tobiu added the `enhancement` label
- 2025-10-15T11:43:14Z @tobiu added the `ai` label
- 2025-10-15T11:47:59Z @tobiu referenced in commit `16c8961` - "Implement Zod-based Validation with JSON Schema Conversion #7494"
- 2025-10-15T11:48:18Z @tobiu closed this issue

