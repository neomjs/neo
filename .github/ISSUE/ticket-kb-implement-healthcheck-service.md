---
title: Implement Healthcheck Service
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7505

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the implementation of the `healthcheck` service for the AI Knowledge Base MCP server. This service will provide a vital endpoint to confirm that the server is operational and, more importantly, that it can connect to its ChromaDB dependency.

## Acceptance Criteria

1.  A new `ai/mcp/server/knowledge-base/services/healthService.mjs` file is created.
2.  The service contains a function that attempts to connect to the ChromaDB server.
3.  If the connection is successful, it should check for the existence of the knowledge base collection (e.g., `neo-knowledge-base`).
4.  The function returns a status object indicating:
    - Overall server status (`healthy` or `unhealthy`).
    - ChromaDB connection status (`connected` or `disconnected`).
    - (Optional) The number of items in the collection if it exists.
5.  The `toolService.mjs` `serviceMapping` is updated to point the `healthcheck` operationId to the new service function.
