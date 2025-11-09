---
id: 7675
title: 'Refactor: Standardize MCP server error response handling'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-27T12:07:17Z'
updatedAt: '2025-10-27T12:35:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7675'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-27T12:35:21Z'
---
# Refactor: Standardize MCP server error response handling

**Reported by:** @tobiu on 2025-10-27

The Model Context Protocol (MCP) servers were incorrectly packaging error objects into the `structuredContent` field of tool responses. This led to client-side schema validation failures because the error object did not match the `outputSchema` defined for successful tool calls.

**Problem:** When a tool execution resulted in an error, the server would return a response like `{"structuredContent": {"error": "..."}, "isError": true}`. The client, expecting `structuredContent` to conform to the tool's success `outputSchema`, would then throw a schema validation error.

**Fix Implemented in `github-workflow` server:**
The `ai/mcp/server/github-workflow/mcp-stdio.mjs` file was modified to correctly handle error responses. Now, when a tool returns an error object, the server: 
1. Sets `isError: true`.
2. Populates the `content` field with a clear, human-readable error message (e.g., `"Tool Error: GitHub CLI command failed. Message: ..."`).
3. **Omits** the `structuredContent` field entirely. This aligns with the MCP specification, which states that `structuredContent` should only be provided when it conforms to the `outputSchema`.

**Action Required:**
This fix needs to be propagated to the other two MCP servers to ensure consistent and correct error handling:
- `ai/mcp/server/knowledge-base/mcp-stdio.mjs`
- `ai/mcp/server/memory-core/mcp-stdio.mjs`

**Reference Change:**
See the changes made in `ai/mcp/server/github-workflow/mcp-stdio.mjs` for the implementation details.

