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
blockedBy: []
blocking: []
closedAt: '2025-10-07T10:53:33Z'
---
# MCP Server: Implement Knowledge Create/Update Endpoint

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

## Timeline

- 2025-10-07T10:48:10Z @tobiu added the `enhancement` label
- 2025-10-07T10:48:10Z @tobiu added parent issue #7399
- 2025-10-07T10:48:10Z @tobiu added the `help wanted` label
- 2025-10-07T10:48:10Z @tobiu added the `good first issue` label
- 2025-10-07T10:48:11Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:48:11Z @tobiu added the `ai` label
- 2025-10-07T10:52:53Z @tobiu removed parent issue #7399
- 2025-10-07T10:53:01Z @tobiu removed the `enhancement` label
- 2025-10-07T10:53:01Z @tobiu removed the `help wanted` label
- 2025-10-07T10:53:01Z @tobiu removed the `good first issue` label
- 2025-10-07T10:53:01Z @tobiu removed the `hacktoberfest` label
- 2025-10-07T10:53:01Z @tobiu removed the `ai` label
### @tobiu - 2025-10-07T10:53:33Z

redundant. closing the ticket.

- 2025-10-07T10:53:34Z @tobiu closed this issue

