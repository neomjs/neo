---
title: Design Knowledge Base MCP Server API
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7401

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
    - `GET /docs`: Serves interactive API documentation (Swagger UI).
    - `GET /healthcheck`: Confirms server health and DB connection.
    - `GET /documents`: Lists all documents in the knowledge base.
    - `GET /documents/:id`: Retrieves a specific document by its ID.
    - `POST /documents/query`: The primary search endpoint.
    - `POST /db/sync`: Triggers the delta update and synchronization process.
    - `DELETE /db`: Deletes the entire knowledge base collection.
3.  The API design is formally documented in an OpenAPI 3.0 specification file at `buildScripts/mcp/knowledge/openapi.yaml`.
4.  The design is documented in a new guide within the `learn/guides/ai/` directory, ready for implementation.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **Design Knowledge Base MCP Server API**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-design-knowledge-mcp-api.md before we begin.
