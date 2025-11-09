---
id: 7503
title: Scaffold Knowledge Base MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T10:00:27Z'
updatedAt: '2025-10-16T10:12:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7503'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T10:12:51Z'
---
# Scaffold Knowledge Base MCP Server

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

This ticket covers the initial scaffolding of the new AI Knowledge Base MCP server. The goal is to create the basic file structure and entry point for the server, consistent with the pattern established by the `github-workflow` MCP server.

## Acceptance Criteria

1.  The core server directory `ai/mcp/server/knowledge-base/` is created.
2.  An `mcp-stdio.mjs` entry point file is created inside the directory, containing the boilerplate for an MCP server.
3.  A `services/` subdirectory is created.
4.  A `toolService.mjs` file is created within `services/`, containing placeholder `listTools` and `callTool` functions.
5.  An entry for the server is added to `.gemini/settings.json` to register it with the CLI.

