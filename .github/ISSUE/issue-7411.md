---
id: 7411
title: 'MCP Server: Implement Memory Lifecycle Endpoints'
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - harikrishna-au
createdAt: '2025-10-07T10:29:11Z'
updatedAt: '2025-10-13T10:05:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7411'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# MCP Server: Implement Memory Lifecycle Endpoints

**Reported by:** @tobiu on 2025-10-07

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for implementing the session lifecycle endpoints for the Memory Core MCP server. This includes triggering the summarization process and clearing old summaries.

## Acceptance Criteria

1.  The server is extended to implement the `POST /sessions/summarize` endpoint, which triggers the asynchronous summarization of all unsummarized sessions.
2.  The server is extended to implement the `DELETE /summaries` endpoint, which deletes all session summaries from the ChromaDB collection.
3.  Appropriate error handling is implemented for both endpoints.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Memory Lifecycle Endpoints**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-memory-lifecycle-endpoints.md before we begin.

## Comments

### @harikrishna-au - 2025-10-13 02:07

@tobiu please assign

### @tobiu - 2025-10-13 10:05

sure, and thanks for your interest. for this ticket, i would also recommend to point the agent to `ai/mcp/server/memory/openapi.yaml`, and let it explore other files for the new memory server (consistency and context).

