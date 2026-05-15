---
id: 7493
title: Implement Dynamic Tool Discovery via OpenAPI
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T10:44:03Z'
updatedAt: '2025-10-15T11:05:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7493'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-15T11:05:12Z'
---
# Implement Dynamic Tool Discovery via OpenAPI

The MCP server must support dynamic tool discovery as described in the protocol specification. A previous refactoring incorrectly implemented a static, hardcoded tool definition within a JavaScript module (`tools.mjs`), which is contrary to the flexible, API-driven nature of the MCP.

This ticket corrects that architectural error. We will reinstate the use of `openapi.yaml` as the single, declarative source of truth for tool definitions. The server will parse this file at runtime to build its list of available tools.

## Acceptance Criteria

1.  The static `tools.mjs` module is deleted.
2.  The `toolService.mjs` is refactored to parse `openapi.yaml` at startup.
3.  During parsing, `operationId`s (in `camelCase`) from the OpenAPI spec will be converted to `snake_case` to serve as the MCP tool `name`, following best practices.
4.  The `listTools` function in `toolService.mjs` will return the list of tools generated from the OpenAPI spec.
5.  The `callTool` function will dynamically execute the correct service function based on the parsed tool definitions.
6.  The `mcp-stdio.mjs` entry point will remain unchanged and will function correctly with the refactored `toolService`.

## Timeline

- 2025-10-15T10:44:03Z @tobiu assigned to @tobiu
- 2025-10-15T10:44:04Z @tobiu added parent issue #7477
- 2025-10-15T10:44:04Z @tobiu added the `enhancement` label
- 2025-10-15T10:44:05Z @tobiu added the `ai` label
- 2025-10-15T11:05:08Z @tobiu referenced in commit `5521758` - "#7493 making callTools => limit optional"
- 2025-10-15T11:05:12Z @tobiu closed this issue

