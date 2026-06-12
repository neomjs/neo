---
id: 7411
title: 'MCP Server: Implement Memory Lifecycle Endpoints'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - harikrishna-au
createdAt: '2025-10-07T10:29:11Z'
updatedAt: '2025-10-24T09:16:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7411'
author: tobiu
commentsCount: 3
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T09:16:28Z'
---
# MCP Server: Implement Memory Lifecycle Endpoints

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

## Timeline

- 2025-10-07T10:29:12Z @tobiu added parent issue #7399
- 2025-10-07T10:29:12Z @tobiu added the `enhancement` label
- 2025-10-07T10:29:13Z @tobiu added the `help wanted` label
- 2025-10-07T10:29:13Z @tobiu added the `good first issue` label
- 2025-10-07T10:29:13Z @tobiu added the `hacktoberfest` label
- 2025-10-07T10:29:13Z @tobiu added the `ai` label
### @harikrishna-au - 2025-10-13T02:07:13Z

@tobiu please assign

### @tobiu - 2025-10-13T10:05:16Z

sure, and thanks for your interest. for this ticket, i would also recommend to point the agent to `ai/mcp/server/memory/openapi.yaml`, and let it explore other files for the new memory server (consistency and context).

- 2025-10-13T10:05:22Z @tobiu assigned to @harikrishna-au
### @tobiu - 2025-10-24T09:16:16Z

Hi @harikrishna-au,

Thank you for your interest in this ticket during Hacktoberfest.

As there has been no activity for a couple of weeks and the project's architecture has been evolving rapidly, the core functionalities for this ticket have now been implemented as part of the main MCP server development.

We're closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

- 2025-10-24T09:16:28Z @tobiu closed this issue

