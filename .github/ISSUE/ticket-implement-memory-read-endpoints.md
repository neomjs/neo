---
title: 'MCP Server: Implement Memory Read Endpoints'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7408

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-memory-server-scaffold.md

## Description

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
