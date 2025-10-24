---
id: 7404
title: 'MCP Server: Implement Knowledge Read Endpoints'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - MannXo
createdAt: '2025-10-07T10:12:56Z'
updatedAt: '2025-10-24T09:25:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7404'
author: tobiu
commentsCount: 5
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-24T09:24:59Z'
---
# MCP Server: Implement Knowledge Read Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the primary read endpoints for the Knowledge Base MCP server. This involves fetching and listing documents from the ChromaDB collection.

## Acceptance Criteria

1.  The server is extended to implement the `GET /documents` endpoint, which lists all documents in the knowledge base (pagination is optional but preferred).
2.  The server is extended to implement the `GET /documents/:id` endpoint, which retrieves a single document by its ID.
3.  Both endpoints return data in the structured JSON format defined in the design ticket.
4.  Appropriate error handling is implemented for cases like a document not being found.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Read Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-read-endpoints.md before we begin.

## Comments

### @MannXo - 2025-10-08 12:12

Hey @tobiu 
I can continue my contribution to #7399 by working on this issue.
Let me know if you dont mind.

Cheers

### @tobiu - 2025-10-08 12:22

Thx, appreciated!

### @MannXo - 2025-10-08 12:42

> Thx, appreciated!

I think I should wait for #7403 to complete before I can start this.
I can take #7402 until then.

### @tobiu - 2025-10-08 12:46

sounds good to me. hint: you need to add a comment to #7402, otherwise i can not assign it to you (github security policy).

### @tobiu - 2025-10-24 09:24

i think this one was resolved via a 2 tickets in 1 PR. logic got converted to the new servers.

