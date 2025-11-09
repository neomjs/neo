---
id: 7408
title: 'MCP Server: Implement Memory Read Endpoints'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - Nalin7parihar
createdAt: '2025-10-07T10:21:05Z'
updatedAt: '2025-10-11T18:07:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7408'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-11T18:07:00Z'
---
# MCP Server: Implement Memory Read Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the primary read endpoints for the Memory Core MCP server. This involves fetching memories and summaries from the ChromaDB collection.

## Acceptance Criteria

1.  The server is extended to implement the `GET /memories` endpoint, which lists all raw memory turns for a given `sessionId`.
2.  The server is extended to implement the `GET /summaries` endpoint, which lists all session summaries.
3.  Both endpoints return data in the structured JSON format defined in the design ticket.
4.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Read Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-read-endpoints.md before we begin.

## Comments

### @Nalin7parihar - 2025-10-07 10:31

Hi! I would like to work on this issue? can you assign it to me?

### @tobiu - 2025-10-07 10:45

Hi, and thanks for your interest. Sure, I can assign the ticket to you. Make sure to read https://github.com/neomjs/neo/issues/7399 first. The work on this ticket is blocked, until the server is set up.

You can explore the current implementation though already, e.g. after instructing the agent to follow the instructions inside the agents.md file, ask it: "use the ai knowledge db and explain what makes neo special."

You can also mention hacktoberfest and start a conversation => the agent can create new tickets.

### @Nalin7parihar - 2025-10-07 10:56

Got it! I’ll go through the epic and design tickets while the setup is in progress.

