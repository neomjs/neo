---
id: 7407
title: 'MCP Server: Implement Memory Server Scaffold'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - SiddharthJiyani
createdAt: '2025-10-07T10:19:23Z'
updatedAt: '2025-10-11T17:30:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7407'
author: tobiu
commentsCount: 5
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-11T17:30:49Z'
---
# MCP Server: Implement Memory Server Scaffold

This is the foundational ticket for the new Memory Core MCP server. The task is to create the basic Node.js server application, set up the project structure, and implement the initial `/healthcheck` endpoint.

This ticket must be completed before any other endpoint implementation tickets for the memory server can be started.

## Acceptance Criteria

1.  A new Node.js server application is created (e.g., using Express.js) within a new `ai/mcp/server/memory/` directory.
2.  The server implements a `GET /healthcheck` endpoint that returns a 200 OK status if it can successfully connect to the ChromaDB instance on port 8001.
3.  A new script, `npm run ai:server-memory-mcp`, is added to `package.json` to start the server.
4.  The server uses a library (e.g., `swagger-ui-express`) to serve interactive API documentation from the OpenAPI specification file at a `/docs` endpoint.
5.  Basic error handling and logging are in place.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Server Scaffold**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-server-scaffold.md before we begin.

## Timeline

- 2025-10-07T10:19:24Z @tobiu added the `enhancement` label
- 2025-10-07T10:19:24Z @tobiu added the `help wanted` label
- 2025-10-07T10:19:24Z @tobiu added parent issue #7399
- 2025-10-07T10:19:25Z @tobiu added the `good first issue` label
- 2025-10-07T10:19:25Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:19:25Z @tobiu added the `ai` label
### @SiddharthJiyani - 2025-10-08T15:34:44Z

I would love to work on this.
Can I start the work ?



- 2025-10-08T15:55:03Z @tobiu assigned to @SiddharthJiyani
### @tobiu - 2025-10-08T15:56:21Z

Hi, and thanks for your interest. Assigned. Please make sure to read the parent epic first: https://github.com/neomjs/neo/issues/7399

Phase 1 just got completed, so the baseline for phase 2 is now in place.

### @Aki-07 - 2025-10-10T19:40:16Z

Hi @tobiu! I'm currently assigned to ticket #7409 (implement memory query endpoints), but I've discovered it depends on this scaffold ticket which hasn't been started yet.
I see this was assigned 2 days ago. Is the assignee still actively working on it? If not, I'd like to take this on as well so I can unblock my query endpoints ticket. I have time today to implement both the scaffold and the query endpoints together in a single PR.
Let me know if I should proceed or if I should wait for the current assignee! Happy to coordinate either way.

### @tobiu - 2025-10-10T19:58:35Z

We actually had this case just yesterday(?) where someone asked if a ticket could get reassigned. From a fairness perspective, I came up with "after a week yes", since this always includes one weekend. I added it here: https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md (item 3.2)

For the meantime, there definitely is an almost infinite amount of items which you could work on instead. My guess is that we could easily create 100+ more files which should get unit tested, another 100+ for component based testing (although i think for this one i probably should resolve phase 1 on my own, to provide a solid starting point. Unless someone wants it as a learning experience).

You could also just ask an ai agent after following the agents.md instructions to suggest new work items for you. Ideally mention hacktoberfest, and the agent should ask you what could be items that match your interests. Of course I will add the `hacktoberfest` label on every self-generated new ticket.

- 2025-10-10T20:14:12Z @Aki-07 cross-referenced by PR #7450
- 2025-10-10T20:46:26Z @Aki-07 cross-referenced by PR #7455
### @Aki-07 - 2025-10-10T20:50:36Z

Thanks for the clarification @tobiu! I completely understand the one-week fairness rule.
Apologies...In the meantime, I've gone ahead and created the implementation for all three dependent tickets as a PR to keep momentum going and learn the codebase:

PR #7455: Memory server scaffold + /healthcheck +  Read endpoints (GET /memories, GET /summaries) +  Query endpoints (POST /memories/query, POST /summaries/query) - my original assignment

To had complete the query endpoint had to work on the memory server as well as on the GET apis. I understand these may need to wait for the original assignee or the one-week mark, but I wanted to have the work ready so there's no delay once we can proceed. I ll go on and try to work on the other things which you have posted

- 2025-10-11T14:57:45Z @Aki-07 cross-referenced by PR #7462
- 2025-10-11T17:30:49Z @tobiu closed this issue

