---
id: 7412
title: 'MCP Server: Implement Memory Admin Endpoints'
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - SarthakJain29
createdAt: '2025-10-07T10:30:50Z'
updatedAt: '2025-10-07T18:53:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7412'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# MCP Server: Implement Memory Admin Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the administrative endpoints for the Memory Core MCP server, which allow for backing up and restoring the memory database.

## Acceptance Criteria

1.  The server is extended to implement the `GET /db/export` endpoint, which exports the memory database to a file.
2.  The server is extended to implement the `POST /db/import` endpoint, which imports a database from a file.
3.  Both endpoints are clearly marked as administrative functions.
4.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Admin Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-admin-endpoints.md before we begin.

## Comments

### @SarthakJain29 - 2025-10-07 17:38

Hey! I would like to work on this issue.

### @tobiu - 2025-10-07 18:53

Hi, and yes again. Be aware: this is a phase 2 item of the new epic. We need to resolve phase 1 first (there are still open items).

