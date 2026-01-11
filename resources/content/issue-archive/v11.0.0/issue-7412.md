---
id: 7412
title: 'MCP Server: Implement Memory Admin Endpoints'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - SarthakJain29
createdAt: '2025-10-07T10:30:50Z'
updatedAt: '2025-10-24T09:14:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7412'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:13:38Z'
---
# MCP Server: Implement Memory Admin Endpoints

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

## Timeline

- 2025-10-07T10:30:51Z @tobiu added parent issue #7399
- 2025-10-07T10:30:52Z @tobiu added the `enhancement` label
- 2025-10-07T10:30:52Z @tobiu added the `help wanted` label
- 2025-10-07T10:30:52Z @tobiu added the `good first issue` label
- 2025-10-07T10:30:52Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:30:53Z @tobiu added the `ai` label
### @SarthakJain29 - 2025-10-07T17:38:18Z

Hey! I would like to work on this issue.

### @tobiu - 2025-10-07T18:53:53Z

Hi, and yes again. Be aware: this is a phase 2 item of the new epic. We need to resolve phase 1 first (there are still open items).

- 2025-10-07T18:53:59Z @tobiu assigned to @SarthakJain29
### @tobiu - 2025-10-24T09:13:26Z

Input from Gemini:

> Hi @SarthakJain29,
> 
> Thank you for your interest in this ticket during Hacktoberfest.
> 
> As there has been no activity for a couple of weeks and the project's architecture has been evolving rapidly, the core functionalities for this ticket have now been implemented as part of the main MCP server development.
> 
> We're closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

- 2025-10-24T09:13:38Z @tobiu closed this issue

