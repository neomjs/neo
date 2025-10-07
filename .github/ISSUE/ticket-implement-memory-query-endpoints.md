---
title: 'MCP Server: Implement Memory Query Endpoints'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7409

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-memory-server-scaffold.md

## Description

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
