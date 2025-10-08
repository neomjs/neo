---
title: 'MCP Server: Implement Memory Lifecycle Endpoints'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7411

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-memory-server-scaffold.md

## Description

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
