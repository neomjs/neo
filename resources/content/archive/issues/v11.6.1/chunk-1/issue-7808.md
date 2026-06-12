---
id: 7808
title: 'Refactor: Rename Server to McpServer in MCP implementations'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T13:25:21Z'
updatedAt: '2025-11-19T13:42:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7808'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T13:42:11Z'
---
# Refactor: Rename Server to McpServer in MCP implementations

The `Server` class from `@modelcontextprotocol/sdk` has been renamed to `McpServer`. We need to update our MCP server implementations to use the new name to avoid deprecation warnings and ensure future compatibility.

Affected files:
- `ai/mcp/server/github-workflow/mcp-stdio.mjs`
- `ai/mcp/server/memory-core/mcp-stdio.mjs`
- `ai/mcp/server/knowledge-base/mcp-stdio.mjs`

## Timeline

- 2025-11-19T13:25:23Z @tobiu added the `enhancement` label
- 2025-11-19T13:25:23Z @tobiu added the `ai` label
- 2025-11-19T13:25:23Z @tobiu added the `refactoring` label
- 2025-11-19T13:27:13Z @tobiu assigned to @tobiu
- 2025-11-19T13:41:44Z @tobiu referenced in commit `38d545d` - "Refactor: Rename Server to McpServer in MCP implementations #7808"
- 2025-11-19T13:42:11Z @tobiu closed this issue

