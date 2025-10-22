---
id: 7521
title: Scaffold Memory Core MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T11:23:47Z'
updatedAt: '2025-10-17T11:34:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7521'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T11:34:03Z'
---
# Scaffold Memory Core MCP Server

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7520 - Epic: Migrate Memory Server to stdio-based MCP

---

This ticket covers the initial scaffolding of the new `memory-core` MCP server. The goal is to create the basic file structure and entry point for the server, consistent with the other MCP servers.

## Acceptance Criteria

1.  The `ai/mcp/server/memory` directory is renamed to `ai/mcp/server/memory-core`.
2.  A new `mcp-stdio.mjs` entry point file is created inside the `memory-core` directory.
3.  The new server is registered in `.gemini/settings.json`, and the old entry is removed.

