---
title: Design Memory Core MCP Server API
labels: enhancement, AI, architecture
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 1
**Assignee:**
**Status:** To Do

## Description

This ticket covers the detailed API design for the new Memory Core MCP server. This server will replace the current CLI scripts, providing a formal, structured interface for agents to interact with their session-based memory.

This design must define a comprehensive, resource-oriented API for managing memories, summaries, sessions, and the database itself.

## Acceptance Criteria

1.  A clear, resource-oriented API endpoint structure is designed.
2.  The following endpoints are defined with their request and response contracts:
    - `GET /healthcheck`: Confirms server health and DB connection.
    - `POST /memories`: Adds a new raw memory turn.
    - `GET /memories`: Reads all memories for a given `sessionId`.
    - `POST /memories/query`: Searches raw memories.
    - `GET /summaries`: Reads all session summaries.
    - `POST /summaries/query`: Searches session summaries.
    - `DELETE /summaries`: Deletes all session summaries.
    - `POST /sessions/summarize`: Triggers the summarization of unsummarized sessions.
    - `GET /db/export`: Exports the entire memory database.
    - `POST /db/import`: Imports a database backup.
3.  The API design is documented in a new markdown file within the `learn/guides/ai/` directory, ready for implementation.
