---
id: 7409
title: 'MCP Server: Implement Memory Query Endpoints'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-07T10:24:23Z'
updatedAt: '2025-10-12T11:15:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7409'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-12T11:15:15Z'
---
# MCP Server: Implement Memory Query Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the search functionality of the Memory Core MCP server. This involves exposing the refactored query logic for both raw memories and summaries.

## Acceptance Criteria

1.  The server is extended to implement the `POST /memories/query` endpoint.
2.  The server is extended to implement the `POST /summaries/query` endpoint.
3.  Both endpoints accept a JSON body with a query string and return a structured JSON response from the correct ChromaDB collection.
4.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Query Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-query-endpoints.md before we begin.

## Comments

### @Aki-07 - 2025-10-10 13:17

Hey @tobiu, love to work on this one! Can u assign me on this

### @tobiu - 2025-10-10 14:10

Hi, and thanks for your interest. Sure, I can assign this ticket to you.

Please make sure to take a look into the related epic first: https://github.com/neomjs/neo/issues/7399

Optional: The "big picture" for this hacktoberfest in neo is "context engineering", a pretty hyped topic in the industry at the moment. I updated the roadmap & project vision last night, and will also add these two links to the epic now for clarity.

https://github.com/neomjs/neo/blob/dev/ROADMAP.md
https://github.com/neomjs/neo/blob/dev/.github/VISION.md

### @tobiu - 2025-10-12 11:15

closing this one as resolved by the read PR.

