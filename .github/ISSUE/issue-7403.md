---
id: 7403
title: 'MCP Server: Implement Knowledge Server Scaffold'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - thisis-gp
createdAt: '2025-10-07T10:10:58Z'
updatedAt: '2025-10-24T09:20:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7403'
author: tobiu
commentsCount: 10
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-24T09:20:25Z'
---
# MCP Server: Implement Knowledge Server Scaffold

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This is the foundational ticket for the new Knowledge Base MCP server. The task is to create the basic Node.js server application, set up the project structure, and implement the initial `/healthcheck` endpoint.

This ticket must be completed before any other endpoint implementation tickets for the knowledge server can be started.

## Acceptance Criteria

1.  A new Node.js server application is created (e.g., using Express.js) within a new `ai/mcp/server/knowledge/` directory.
2.  The server implements a `GET /healthcheck` endpoint that returns a 200 OK status if it can successfully connect to the ChromaDB instance on port 8000.
3.  A new script, `npm run ai:server-knowledge`, is added to `package.json` to start the server.
4.  The server uses a library (e.g., `swagger-ui-express`) to serve interactive API documentation from the OpenAPI specification file at a `/docs` endpoint.
5.  Basic error handling and logging are in place.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Server Scaffold**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-server-scaffold.md before we begin.

## Comments

### @thisis-gp - 2025-10-07 16:24

@tobiu Can you assign me this issue?

### @tobiu - 2025-10-07 16:30

Hi, and thanks for your interest. Sure, I can assign the ticket to you. Make sure to read https://github.com/neomjs/neo/issues/7399 first. The work on this ticket is blocked, until the server is set up (phase 1 is completed).

You can explore the current implementation though already, e.g. after instructing the agent to follow the instructions inside the agents.md file, ask it: "use the ai knowledge db and explain what makes neo special."

You can also mention hacktoberfest and start a conversation => the agent can create new tickets.

Or you could also pick one of the phase 1 items.

### @tobiu - 2025-10-08 14:46

heads up: i changed the file path from `buildScripts/mcp/` to `ai/mcp/server/`, which feels better suited as the new location inside the repo.

### @tobiu - 2025-10-11 17:34

FYI: the other MCP server scaffolding is completed. You might want to take a look at it, for feeding the agent with the files (saving time and getting consistency): https://github.com/neomjs/neo/tree/dev/ai/mcp/server/memory

### @MannXo - 2025-10-14 14:24

Hey, is this ticket in progress? I'm afraid it's blocking the endpoint implementation tasks.

### @tobiu - 2025-10-14 15:02

I don't know. I updated https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md with section 3.2, so that tickets can get reassigned in case there is no PR or ticket comment after one week.

@MannXo I started working on: https://github.com/neomjs/neo/issues/7477, especially this sub is important: https://github.com/neomjs/neo/issues/7487.

The idea is to keep Open API specs as the "single source of truth", but deriving tool specs from it. Tools might just be a subset of the full spec. This will be highly relevant for the 2 other MCP servers (memory core & knowledge base) too. We could create new subs for this epic already.

Unrelated brainstorming: Inside the agents file, we consume `docs/output/class-hierarchy.yaml` (over 500 lines), which feels wasteful from a token consumption perspective. Instead, we could add a new database (e.g. SQL) into the knowledge base server, and support queries to list all parent namespaces and file paths for a given class. This should also work for hacktoberfest tickets.

### @MannXo - 2025-10-14 15:34

> I don't know. I updated https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md with section 3.2, so that tickets can get reassigned in case there is no PR or ticket comment after one week.
> 
> [@MannXo](https://github.com/MannXo) I started working on: [#7477](https://github.com/neomjs/neo/issues/7477), especially this sub is important: [#7487](https://github.com/neomjs/neo/issues/7487).
> 
> The idea is to keep Open API specs as the "single source of truth", but deriving tool specs from it. Tools might just be a subset of the full spec. This will be highly relevant for the 2 other MCP servers (memory core & knowledge base) too. We could create new subs for this epic already.
> 
> Unrelated brainstorming: Inside the agents file, we consume `docs/output/class-hierarchy.yaml` (over 500 lines), which feels wasteful from a token consumption perspective. Instead, we could add a new database (e.g. SQL) into the knowledge base server, and support queries to list all parent namespaces and file paths for a given class. This should also work for hacktoberfest tickets.

Thanks @tobiu, that sounds very exciting. I'm happy to help with 7477 epic tickets. However, in terms of Hacktoberfest, I have secured more than enough PRs. I'm just genuinely interested in this project and wanted to contribute besides Hacktoberfest. So, if you are aiming to preserve these tickets to allow more people to contribute to Hacktoberfest, I'm happy to revisit this project after October. Let me know which works best.

Cheers.

### @tobiu - 2025-10-14 16:33

Appreciated! The project could definitely use more contributors beyond the hacktoberfest scope. I would not recommend 7477 though, since I will most likely change the specs a lot on the fly => want to resolve it this week, since it is my biggest own bottleneck to better support others. My recommendation would be to work on the other 2 MCP servers, and feel free to create new tickets as needed.

We should be good for the hacktoberfest scope: we still have the unit testing, component based testing and component test ticket creation epics, and could literally add 100s of additional subs in there.

### @MannXo - 2025-10-20 12:47

Hey @tobiu I'm happy to take care of this one since there doesn't seem to be any activity after 2 weeks.
lmk if I can start working on this.

### @tobiu - 2025-10-24 09:20

Hi @thisis-gp and @MannXo,

Thank you both for your interest in this ticket.

As there has been no PR for this foundational task and the project's architecture has been evolving rapidly, the scaffold for the Knowledge Base MCP server has now been implemented.

We're closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

