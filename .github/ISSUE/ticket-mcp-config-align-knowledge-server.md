---
title: 'MCP Config: Align Knowledge Server Port and Health Check'
labels: enhancement, AI, documentation
---

GH ticket id: (will be created later)

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This ticket documents the correction of the `neo-knowledge-base` server definition within the `.github/mcp-servers.json` configuration file.

The initial configuration incorrectly listed the connection port as `3000` and the health check endpoint as `/api/health`. This was inconsistent with the planned architecture (where ChromaDB runs on port `8000`) and with the API conventions established by the `neo-memory-core` server.

The configuration was updated to:
-   Set the `port` to `8000`.
-   Set the `healthCheck.url` to `http://localhost:8000/api/v2/healthcheck`.

This change ensures that the MCP server configuration accurately reflects the intended architecture and maintains consistency across the defined services.
