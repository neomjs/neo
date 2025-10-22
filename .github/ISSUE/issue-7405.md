---
id: 7405
title: 'MCP Server: Implement Knowledge Query Endpoint'
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - Mahita07
createdAt: '2025-10-07T10:14:42Z'
updatedAt: '2025-10-08T09:38:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7405'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# MCP Server: Implement Knowledge Query Endpoint

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the core search functionality of the Knowledge Base MCP server. This involves exposing the refactored query logic via the `POST /documents/query` endpoint.

## Acceptance Criteria

1.  The server is extended to implement the `POST /documents/query` endpoint.
2.  The endpoint accepts a JSON body with a query string and optional filters.
3.  The endpoint uses the refactored query module to perform a search against the ChromaDB collection.
4.  The endpoint returns a structured JSON response containing the search results, as defined in the design ticket.
5.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Query Endpoint**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-query-endpoint.md before we begin.

## Comments

### @Mahita07 - 2025-10-08 02:48

@tobiu Could you please assign this ticket to me ? 

### @tobiu - 2025-10-08 09:38

Sure and thx!

