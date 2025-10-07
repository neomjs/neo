---
title: Implement Memory Core MCP Server
labels: enhancement, AI, implementation
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do

## Description

This ticket is for the implementation of the Memory Core MCP server, based on the API design defined in `ticket-design-memory-mcp-api.md`.

This involves refactoring the core logic from all relevant scripts in `buildScripts/ai/` (e.g., `addMemory`, `queryMemory`, `summarizeSession`, `clearSummaries`, `exportMemory`, `importMemory`) into reusable modules. A new Node.js server will then expose this functionality via a RESTful API.

## Acceptance Criteria

1.  A new Node.js server application is created.
2.  The server correctly implements the following RESTful endpoints:
    - `GET /healthcheck`: Returns a 200 OK status.
    - `POST /memories`: Adds a new raw memory entry.
    - `GET /memories`: Reads all memories for a given `sessionId`.
    - `POST /memories/query`: Searches raw memories.
    - `GET /summaries`: Reads all session summaries.
    - `POST /summaries/query`: Searches session summaries.
    - `DELETE /summaries`: Deletes all session summaries.
    - `POST /sessions/summarize`: Triggers the summarization process.
    - `GET /db/export`: Exports the memory database.
    - `POST /db/import`: Imports a database backup.
3.  A new script, `npm run ai:server-memory-mcp`, is added to `package.json` to start the server.
4.  The server successfully connects to the ChromaDB instance running on port 8001.
5.  The implementation is robust and includes appropriate error handling.
