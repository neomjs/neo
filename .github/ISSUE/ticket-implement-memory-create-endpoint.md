---
title: 'MCP Server: Implement Memory Create Endpoint'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7410

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-memory-server-scaffold.md

## Description

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
