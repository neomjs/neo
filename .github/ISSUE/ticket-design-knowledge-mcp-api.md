---
title: Design Knowledge Base MCP Server API
labels: enhancement, AI, architecture
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 1
**Assignee:**
**Status:** To Do

## Description

This ticket covers the detailed API design for the new Knowledge Base MCP server. The server will replace the current `npm run ai:query` script, providing a formal, structured interface for agents to query the project's knowledge base.

This design must define a comprehensive, resource-oriented API for managing the documents and the database itself, ensuring consistency with the Memory Core MCP server.

## Acceptance Criteria

1.  A clear, resource-oriented API endpoint structure is designed.
2.  The following endpoints are defined with their request and response contracts:
    - `GET /healthcheck`: Confirms server health and DB connection.
    - `GET /documents`: Lists all documents in the knowledge base.
    - `GET /documents/:id`: Retrieves a specific document by its ID.
    - `POST /documents/query`: The primary search endpoint.
    - `POST /db/rebuild`: Triggers a full rebuild of the knowledge base.
    - `DELETE /db`: Deletes the entire knowledge base collection.
3.  The API design is documented in a new markdown file within the `learn/guides/ai/` directory, ready for implementation.
