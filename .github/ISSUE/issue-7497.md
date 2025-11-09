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
closedAt: '2025-10-15T12:17:13Z'
---
# Refine `mcp-stdio.mjs` for MCP Compliance and Clarity

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

The `ai/mcp/server/github-workflow/mcp-stdio.mjs` file can be improved for better compliance with the MCP specification and clarity. Specifically, the `tools/list` response should fully conform to `ToolSchema`, and the server capabilities should be explicitly defined.

## Acceptance Criteria

1.  The `capabilities.tools` object in the server initialization is updated to explicitly state `listChanged: false`.
2.  The `mcpTools` mapping within the `ListToolsRequestSchema` handler is updated to include `title`, `outputSchema`, and `annotations` from the `tool` object returned by `listTools`.
3.  The comment "// Convert from your format to MCP format" is removed or updated to be more accurate.

