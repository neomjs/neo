---
title: Design Memory Core MCP Server API
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7402

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
    - `GET /docs`: Serves interactive API documentation (Swagger UI).
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
3.  The API design is formally documented in an OpenAPI 3.0 specification file (e.g., `openapi.yaml`).
4.  The API design is documented in a new markdown file within the `learn/guides/ai/` directory, ready for implementation.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **Design Memory Core MCP Server API**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-design-memory-mcp-api.md before we begin.
