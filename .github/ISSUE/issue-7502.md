---
id: 7502
title: Design Knowledge Base MCP Server API
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T09:47:33Z'
updatedAt: '2025-10-16T09:55:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7502'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T09:55:02Z'
---
# Design Knowledge Base MCP Server API

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

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

