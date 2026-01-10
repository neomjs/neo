---
id: 7497
title: Refine `mcp-stdio.mjs` for MCP Compliance and Clarity
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T12:13:31Z'
updatedAt: '2025-10-15T12:17:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7497'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-15T12:17:13Z'
---
# Refine `mcp-stdio.mjs` for MCP Compliance and Clarity

The `ai/mcp/server/github-workflow/mcp-stdio.mjs` file can be improved for better compliance with the MCP specification and clarity. Specifically, the `tools/list` response should fully conform to `ToolSchema`, and the server capabilities should be explicitly defined.

## Acceptance Criteria

1.  The `capabilities.tools` object in the server initialization is updated to explicitly state `listChanged: false`.
2.  The `mcpTools` mapping within the `ListToolsRequestSchema` handler is updated to include `title`, `outputSchema`, and `annotations` from the `tool` object returned by `listTools`.
3.  The comment "// Convert from your format to MCP format" is removed or updated to be more accurate.

## Timeline

- 2025-10-15 @tobiu assigned to @tobiu
- 2025-10-15 @tobiu added parent issue #7477
- 2025-10-15 @tobiu added the `enhancement` label
- 2025-10-15 @tobiu added the `ai` label
- 2025-10-15 @tobiu referenced in commit `3db26e1` - "Refine mcp-stdio.mjs for MCP Compliance and Clarity #7497"
- 2025-10-15 @tobiu closed this issue

