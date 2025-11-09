---
id: 7425
title: 'MCP Config: Align Knowledge Server Port and Health Check'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-09T10:25:29Z'
updatedAt: '2025-10-09T10:28:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7425'
author: tobiu
commentsCount: 0
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-09T10:28:18Z'
---
# MCP Config: Align Knowledge Server Port and Health Check

**Reported by:** @tobiu on 2025-10-09

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket documents the correction of the `neo-knowledge-base` server definition within the `.github/mcp-servers.json` configuration file.

The initial configuration incorrectly listed the connection port as `3000` and the health check endpoint as `/api/health`. This was inconsistent with the planned architecture (where ChromaDB runs on port `8000`) and with the API conventions established by the `neo-memory-core` server.

The configuration was updated to:
-   Set the `port` to `8000`.
-   Set the `healthCheck.url` to `http://localhost:8000/api/v2/healthcheck`.

This change ensures that the MCP server configuration accurately reflects the intended architecture and maintains consistency across the defined services.

