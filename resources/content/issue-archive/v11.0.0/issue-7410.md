---
id: 7410
title: 'MCP Server: Implement Memory Create Endpoint'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - nabeel001
createdAt: '2025-10-07T10:26:38Z'
updatedAt: '2025-10-24T09:21:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7410'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:21:47Z'
---
# MCP Server: Implement Memory Create Endpoint

This ticket is for implementing the core data-entry functionality of the Memory Core MCP server: adding a new memory turn. This will be the most frequently called endpoint during an agent's operation.

## Acceptance Criteria

1.  The server is extended to implement the `POST /memories` endpoint.
2.  The endpoint accepts a JSON body containing `sessionId`, `prompt`, `thought`, and `response`.
3.  The endpoint uses the refactored module to add the new entry to the ChromaDB memory collection.
4.  The endpoint returns a success confirmation.
5.  Appropriate error handling and validation are implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Create Endpoint**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-create-endpoint.md before we begin.

## Timeline

- 2025-10-07T10:26:39Z @tobiu added the `enhancement` label
- 2025-10-07T10:26:39Z @tobiu added parent issue #7399
- 2025-10-07T10:26:40Z @tobiu added the `help wanted` label
- 2025-10-07T10:26:40Z @tobiu added the `good first issue` label
- 2025-10-07T10:26:40Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:26:40Z @tobiu added the `ai` label
### @nabeel001 - 2025-10-08T03:21:24Z

i would like to work on this. kindly assign this to me @tobiu 

### @tobiu - 2025-10-08T09:35:52Z

Sure. Hint: this is a phase 2 item of https://github.com/neomjs/neo/issues/7399 => it requires phase 1 to be completed before you can start working on it.

- 2025-10-08T09:36:00Z @tobiu assigned to @nabeel001
### @tobiu - 2025-10-24T09:21:36Z

Hi @nabeel001,

Thank you for your interest in this ticket during Hacktoberfest.

As there has been no activity for a couple of weeks and the project's architecture has been evolving rapidly, the core functionalities for this ticket have now been implemented as part of the main MCP server development.

We're closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

- 2025-10-24T09:21:47Z @tobiu closed this issue

