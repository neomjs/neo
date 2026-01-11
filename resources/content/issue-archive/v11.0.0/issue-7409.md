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
blockedBy: []
blocking: []
closedAt: '2025-10-12T11:15:15Z'
---
# MCP Server: Implement Memory Query Endpoints

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

## Timeline

- 2025-10-07T10:24:24Z @tobiu added the `enhancement` label
- 2025-10-07T10:24:24Z @tobiu added parent issue #7399
- 2025-10-07T10:24:25Z @tobiu added the `help wanted` label
- 2025-10-07T10:24:25Z @tobiu added the `good first issue` label
- 2025-10-07T10:24:25Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:24:25Z @tobiu added the `ai` label
### @Aki-07 - 2025-10-10T13:17:38Z

Hey @tobiu, love to work on this one! Can u assign me on this

### @tobiu - 2025-10-10T14:10:08Z

Hi, and thanks for your interest. Sure, I can assign this ticket to you.

Please make sure to take a look into the related epic first: https://github.com/neomjs/neo/issues/7399

Optional: The "big picture" for this hacktoberfest in neo is "context engineering", a pretty hyped topic in the industry at the moment. I updated the roadmap & project vision last night, and will also add these two links to the epic now for clarity.

https://github.com/neomjs/neo/blob/dev/ROADMAP.md
https://github.com/neomjs/neo/blob/dev/.github/VISION.md

- 2025-10-10T14:10:14Z @tobiu assigned to @Aki-07
- 2025-10-10T19:40:17Z @Aki-07 cross-referenced by #7407
- 2025-10-10T20:47:14Z @Aki-07 cross-referenced by PR #7455
- 2025-10-11T15:10:05Z @Aki-07 cross-referenced by PR #7463
### @tobiu - 2025-10-12T11:15:15Z

closing this one as resolved by the read PR.

- 2025-10-12T11:15:15Z @tobiu closed this issue

