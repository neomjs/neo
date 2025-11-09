---
id: 7492
title: Refactor to Direct MCP Tool Definitions
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T10:29:37Z'
updatedAt: '2025-10-15T10:35:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7492'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-15T10:35:02Z'
---
# Refactor to Direct MCP Tool Definitions

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

As per the official Model Context Protocol (MCP) specification, tools are defined with a specific JSON Schema-based structure (`name`, `description`, `inputSchema`, etc.).

Our current implementation uses an `openapi.yaml` file as a source of truth, which is then parsed by `toolService.mjs` to generate the MCP-compliant tool definitions. This is an unnecessary layer of abstraction.

This ticket covers the refactoring of the GitHub Workflow MCP server to define tools directly in code, aligning with the MCP specification and simplifying the architecture.

## Acceptance Criteria

1.  The `openapi.yaml` file is deleted.
2.  A new module is created (e.g., `ai/mcp/server/github-workflow/tools.mjs`) that exports an array of tool definitions, strictly following the MCP `Tool` schema.
3.  `toolService.mjs` is refactored to import the tool definitions directly from the new module instead of parsing the OpenAPI spec.
4.  All Express-related files (`index.mjs`, `app.mjs`, `config.mjs`, and the `routes` and `middleware` directories) are deleted.
5.  The `ai:server-github-workflow-mcp` script in `package.json` is verified to work correctly with the refactored server.

