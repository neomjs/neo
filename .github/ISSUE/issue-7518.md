---
id: 7518
title: Make toolService resilient to server-prefixed tool names
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T10:46:42Z'
updatedAt: '2025-10-17T10:48:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7518'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T10:48:12Z'
---
# Make toolService resilient to server-prefixed tool names

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

The Gemini CLI disambiguates tool name collisions from different MCP servers by prefixing the tool name with the server name (e.g., `neo-knowledge-base__healthcheck`). This causes `callTool` to fail, as it looks for the exact prefixed name in the `serviceMapping`.

This ticket is to make the `callTool` function in the shared `toolService.mjs` resilient to this behavior.

## Acceptance Criteria

1.  The `callTool` function in `ai/mcp/server/toolService.mjs` is modified.
2.  The function checks if the incoming `toolName` contains `__`.
3.  If it does, it uses the substring after the last `__` as the effective tool name for lookup.
4.  Tool calls with prefixed names now execute correctly.
5.  Tool calls with non-prefixed names continue to work as before.

