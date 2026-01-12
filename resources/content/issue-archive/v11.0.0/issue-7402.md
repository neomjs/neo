---
id: 7402
title: Design Memory Core MCP Server API
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - MannXo
createdAt: '2025-10-07T10:08:20Z'
updatedAt: '2025-10-08T15:35:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7402'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-08T15:35:32Z'
---
# Design Memory Core MCP Server API

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

## Timeline

- 2025-10-07T10:08:22Z @tobiu added parent issue #7399
- 2025-10-07T10:08:22Z @tobiu added the `enhancement` label
- 2025-10-07T10:08:22Z @tobiu added the `help wanted` label
- 2025-10-07T10:08:22Z @tobiu added the `good first issue` label
- 2025-10-07T10:08:22Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:08:23Z @tobiu added the `ai` label
- 2025-10-08T12:42:15Z @MannXo cross-referenced by #7404
### @MannXo - 2025-10-08T12:47:46Z

Can you assign this to me? @tobiu 

- 2025-10-08T12:50:45Z @tobiu assigned to @MannXo
### @tobiu - 2025-10-08T12:50:55Z

done

- 2025-10-08T15:09:02Z @MannXo referenced in commit `7e2bca2` - "Design Memory Core MCP Server API

- Create OpenAPI 3.0 specification with all 11 required endpoints
- Add comprehensive API documentation guide
- Update navigation tree
- Resolves #7402"
- 2025-10-08T15:15:36Z @MannXo cross-referenced by PR #7419
- 2025-10-08T15:35:32Z @tobiu closed this issue
- 2025-10-08T15:35:32Z @tobiu referenced in commit `6bcdc06` - "Design Memory Core MCP Server API

- Create OpenAPI 3.0 specification with all 11 required endpoints
- Add comprehensive API documentation guide
- Update navigation tree
- Resolves #7402"
- 2025-10-10T20:42:11Z @Aki-07 cross-referenced by PR #7454

