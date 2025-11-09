---
id: 7491
title: Implement MCP Stdio Server for GitHub Workflow
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T10:12:51Z'
updatedAt: '2025-10-15T10:14:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7491'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-15T10:14:26Z'
---
# Implement MCP Stdio Server for GitHub Workflow

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

The current Express.js based server for the GitHub Workflow (`ai/mcp/server/github-workflow/index.mjs`) is not compatible with the agentic workflow, as it doesn't communicate over the Model Context Protocol (MCP).

This ticket covers the work to replace the Express server with a proper MCP-compliant server that uses a `stdio` transport. This will involve creating a new server file that utilizes the `@modelcontextprotocol/sdk`.

## Acceptance Criteria

1.  A new dev dependency, `@modelcontextprotocol/sdk`, is added to `package.json`.
2.  A new server file, `ai/mcp/server/github-workflow/mcp-stdio.mjs`, is created. This file will initialize a `Server` from the SDK and use a `StdioServerTransport`.
3.  The `ai:server-github-workflow-mcp` script in `package.json` is updated to execute the new `mcp-stdio.mjs` file.
4.  The `.gemini/settings.json` file is updated to correctly configure the `neo-github-workflow` MCP server, ensuring the `command` and `args` point to the new npm script.
5.  The old Express server file (`index.mjs` and related files like `app.mjs` if they are no longer needed) should be reviewed for deprecation or removal.

