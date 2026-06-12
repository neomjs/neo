---
id: 7487
title: Enhance Tools List with OpenAPI Schema
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T12:23:57Z'
updatedAt: '2025-10-14T12:30:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7487'
author: tobiu
commentsCount: 1
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-14T12:30:44Z'
---
# Enhance Tools List with OpenAPI Schema

See: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

The current `/tools/list` endpoint provides only the name and description of available tools. To enable robust client-side integration and dynamic tool generation for the agent, the tool list needs to include the full OpenAPI schema for each tool's parameters and response, as dictated by the Model Context Protocol (MCP) specification.

This enhancement will allow the agent to fully understand how to call each tool, including required arguments, their types, and the expected return format, directly from the `/tools/list` response.

## Acceptance Criteria

1.  The `toolService.mjs` is updated to extract relevant schema information (parameters, requestBody) for each operation from the `openapi.yaml` and convert it into a single `inputSchema` (JSON Schema) for each tool.
2.  The `GET /tools/list` endpoint's response for each tool includes:
    -   `name` (string): The unique identifier for the tool (from `operationId`).
    -   `title` (string): A human-readable title for the tool (from `summary`).
    -   `description` (string): A detailed description of the tool (from `description`).
    -   `inputSchema` (JSON Schema object): A JSON Schema defining the tool's parameters, derived from the OpenAPI operation's `parameters` and `requestBody`.
3.  The `callTool` function in `toolService.mjs` is updated to remove the manual `switch` statement for argument mapping. It should expect `args` to conform to the `inputSchema` and use a more generic method to pass them to the `tool.handler`.
4.  The `outputSchema` (JSON Schema object) is optionally included in the tool definition if available in the OpenAPI response.

## Timeline

- 2025-10-14T12:23:57Z @tobiu assigned to @tobiu
- 2025-10-14T12:23:59Z @tobiu added the `enhancement` label
- 2025-10-14T12:23:59Z @tobiu added the `ai` label
- 2025-10-14T12:23:59Z @tobiu added parent issue #7477
- 2025-10-14T12:26:57Z @tobiu referenced in commit `d2af666` - "Enhance Tools List with OpenAPI Schema #7487"
- 2025-10-14T12:29:58Z @tobiu referenced in commit `d5fe8f3` - "#7487 buildOutputSchema()"
### @tobiu - 2025-10-14T12:30:44Z

<img width="837" height="789" alt="Image" src="https://github.com/user-attachments/assets/7c179ecd-1bcf-4c5e-a3d3-4f990c846819" />

- 2025-10-14T12:30:44Z @tobiu closed this issue
- 2025-10-14T15:02:51Z @tobiu cross-referenced by #7403

