---
id: 7519
title: Dynamically determine argument passing strategy from OpenAPI spec
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T10:59:40Z'
updatedAt: '2025-10-17T11:00:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7519'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T11:00:39Z'
---
# Dynamically determine argument passing strategy from OpenAPI spec

Currently, the shared `toolService.mjs` contains a hardcoded list of tool names that require their arguments to be passed as a single object to the handler function. This is brittle and not scalable.

This ticket is to refactor the `toolService` to determine the argument passing strategy dynamically from the OpenAPI specification for each tool. This will be achieved by introducing a custom OpenAPI extension field, `x-pass-as-object`.

## Acceptance Criteria

1.  A custom field, `x-pass-as-object: true`, is added to the OpenAPI specification for operations whose handlers expect a single arguments object.
2.  The `initializeToolMapping` function in `ai/mcp/server/toolService.mjs` is updated to read this flag and store it with the tool's definition.
3.  The `callTool` function is updated to use this flag to determine whether to pass arguments as a single object or as positional arguments.
4.  The hardcoded array of tool names is removed from `callTool`.
5.  All tool calls continue to function correctly for both MCP servers.

## Timeline

- 2025-10-17T10:59:40Z @tobiu assigned to @tobiu
- 2025-10-17T10:59:42Z @tobiu added parent issue #7501
- 2025-10-17T10:59:42Z @tobiu added the `enhancement` label
- 2025-10-17T10:59:42Z @tobiu added the `ai` label
- 2025-10-17T11:00:23Z @tobiu referenced in commit `5e92dcf` - "Dynamically determine argument passing strategy from OpenAPI spec #7519"
- 2025-10-17T11:00:39Z @tobiu closed this issue

