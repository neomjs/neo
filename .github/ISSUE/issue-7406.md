---
id: 7406
title: 'MCP Server: Implement Knowledge Admin Endpoints'
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - tanmaytare
createdAt: '2025-10-07T10:17:15Z'
updatedAt: '2025-10-08T16:31:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7406'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# MCP Server: Implement Knowledge Admin Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the administrative endpoints for the Knowledge Base MCP server. These are powerful, potentially destructive operations that are useful for managing the knowledge base lifecycle.

## Acceptance Criteria

1.  The server is extended to implement the `POST /db/sync` endpoint, which triggers the asynchronous delta update and synchronization process (i.e., runs the `create` and `embed` scripts).
2.  The server is extended to implement the `DELETE /db` endpoint, which clears the entire knowledge base collection from ChromaDB.
3.  Both endpoints are protected or clearly marked as administrative, high-impact functions.
4.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Admin Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-admin-endpoints.md before we begin.

## Comments

### @tanmaytare - 2025-10-08 16:18

I want to work on this ,please assign to me

### @tobiu - 2025-10-08 16:31

Hi, and thanks for your interest. Assigned. Please make sure to read the parent epic first: https://github.com/neomjs/neo/issues/7399

