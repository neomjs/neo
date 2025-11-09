---
id: 7413
title: 'MCP Server: Implement Knowledge Create/Update Endpoint'
state: CLOSED
labels: []
assignees: []
createdAt: '2025-10-07T10:48:09Z'
updatedAt: '2025-10-07T10:53:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7413'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-07T10:53:33Z'
---
# MCP Server: Implement Knowledge Create/Update Endpoint

**Reported by:** @tobiu on 2025-10-07

To improve the efficiency of maintaining the knowledge base, this ticket is for implementing an endpoint to create or update a single document. This allows for fast, incremental updates without requiring a full, time-consuming rebuild of the entire knowledge base every time a single file changes.

## Acceptance Criteria

1.  The server is extended to implement a `PUT /documents/:id` endpoint, where `:id` is the URL-encoded path of the document.
2.  If the document already exists in the ChromaDB collection, it is updated with the new content.
3.  If the document does not exist, it is created.
4.  The endpoint accepts the new file content in its request body.
5.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Create/Update Endpoint**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-create-update-endpoint.md before we begin.

## Comments

### @tobiu - 2025-10-07 10:53

redundant. closing the ticket.

