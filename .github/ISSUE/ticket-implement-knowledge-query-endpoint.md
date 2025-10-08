---
title: 'MCP Server: Implement Knowledge Query Endpoint'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7405

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-knowledge-server-scaffold.md

## Description

This ticket is for implementing the core search functionality of the Knowledge Base MCP server. This involves exposing the refactored query logic via the `POST /documents/query` endpoint.

## Acceptance Criteria

1.  The server is extended to implement the `POST /documents/query` endpoint.
2.  The endpoint accepts a JSON body with a query string and optional filters.
3.  The endpoint uses the refactored query module to perform a search against the ChromaDB collection.
4.  The endpoint returns a structured JSON response containing the search results, as defined in the design ticket.
5.  Appropriate error handling is implemented.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **MCP Server: Implement Knowledge Query Endpoint**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-implement-knowledge-query-endpoint.md before we begin.
