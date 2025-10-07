---
title: Implement Knowledge Base MCP Server
labels: enhancement, AI, implementation
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do

## Description

This ticket is for the implementation of the Knowledge Base MCP server, based on the API design defined in `ticket-design-knowledge-mcp-api.md`.

This involves refactoring the core query logic from `buildScripts/ai/queryKnowledgeBase.mjs` into a reusable module. A new Node.js server (e.g., using Express.js) will then be created to import this module and expose its functionality via a RESTful API.

## Acceptance Criteria

1.  A new Node.js server application is created.
2.  The server correctly implements the following RESTful endpoints:
    - `GET /healthcheck`: Returns a 200 OK status.
    - `GET /documents`: Lists all documents in the knowledge base.
    - `GET /documents/:id`: Retrieves a specific document by its ID.
    - `POST /documents/query`: The primary search endpoint.
    - `POST /db/rebuild`: Triggers a full rebuild of the knowledge base.
    - `DELETE /db`: Deletes the entire knowledge base collection.
3.  A new script, `npm run ai:server-knowledge`, is added to `package.json` to start the server.
4.  The server successfully connects to the ChromaDB instance running on port 8000 and executes queries.
5.  The implementation is robust and includes appropriate error handling.
