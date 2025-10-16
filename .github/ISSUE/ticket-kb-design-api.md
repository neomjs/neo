---
title: Design Knowledge Base MCP Server API
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7502

**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the detailed API design for the new Knowledge Base MCP server. The server will replace the current `npm run ai:query` and `npm run ai:build-kb` scripts, providing a formal, structured interface for agents to query and manage the project's knowledge base.

This design must define a comprehensive, resource-oriented API for managing the documents and the database itself.

## Acceptance Criteria

1.  A clear, resource-oriented API endpoint structure is designed.
2.  The following endpoints are defined with their request and response contracts:
    - `GET /healthcheck`: Confirms server health and DB connection.
    - `POST /db/sync`: Triggers the delta update and synchronization process (build & embed).
    - `DELETE /db`: Deletes the entire knowledge base collection.
    - `POST /documents/query`: The primary search endpoint.
    - `GET /documents`: (Optional) Lists all documents in the knowledge base.
    - `GET /documents/:id`: (Optional) Retrieves a specific document by its ID.
3.  The API design is formally documented in an OpenAPI 3.0 specification file at `ai/mcp/server/knowledge-base/openapi.yaml`.
