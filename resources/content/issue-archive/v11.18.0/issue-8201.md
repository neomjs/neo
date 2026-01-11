---
id: 8201
title: 'Fix `nextCursor: null` violation and OpenAPI Array Validation in MCP Servers'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T13:33:57Z'
updatedAt: '2025-12-29T13:42:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8201'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T13:42:19Z'
---
# Fix `nextCursor: null` violation and OpenAPI Array Validation in MCP Servers

The MCP SDK schema validation requires `nextCursor` to be `string | undefined`, but `null` is being returned in the `catch` blocks of `listTools` handlers across all MCP servers (Neural Link, Knowledge Base, GitHub Workflow, Memory Core) and in the default return of `ToolService.mjs`. This causes a "Invalid input: expected string, received null" error that masks the underlying exception when tool discovery fails.

This task involves updating the logic in:
- `ai/mcp/ToolService.mjs`
- `ai/mcp/server/neural-link/Server.mjs`
- `ai/mcp/server/knowledge-base/Server.mjs`
- `ai/mcp/server/github-workflow/Server.mjs`
- `ai/mcp/server/memory-core/Server.mjs`

Additionally, `ai/mcp/validation/OpenApiValidator.mjs` needs to be robust against OpenAPI array schemas that do not define an `items` property (defaulting to `any[]`).

## Timeline

- 2025-12-29T13:33:58Z @tobiu added the `bug` label
- 2025-12-29T13:33:58Z @tobiu added the `ai` label
- 2025-12-29T13:36:51Z @tobiu assigned to @tobiu
- 2025-12-29T13:42:01Z @tobiu referenced in commit `a45e8f6` - "Fix nextCursor: null violation and OpenAPI Array Validation in MCP Servers #8201"
- 2025-12-29T13:42:19Z @tobiu closed this issue

