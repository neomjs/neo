---
id: 7401
title: Design Knowledge Base MCP Server API
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - Chesblaw
createdAt: '2025-10-07T10:05:47Z'
updatedAt: '2025-10-24T09:26:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7401'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-24T09:26:20Z'
---
# Design Knowledge Base MCP Server API

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

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

## Comments

### @Chesblaw - 2025-10-08 03:45

@tobiu sup can you assign me

### @tobiu - 2025-10-08 09:32

Hi, and thanks for your interest. Sure, I can assign the ticket to you. Please look into the parent epic first, since it requires the new "AI Native" workflows: https://github.com/neomjs/neo/issues/7399

### @tobiu - 2025-10-24 09:26

Hi @Chesblaw,

Thank you for your interest in this ticket during Hacktoberfest.

As there has been no activity for a couple of weeks and the project's architecture has been evolving rapidly, the API for the Knowledge Base MCP server has now been designed and implemented.

We're closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

