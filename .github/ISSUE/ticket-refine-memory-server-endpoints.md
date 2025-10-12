---
title: 'MCP Server: Refine Memory Server Endpoints'
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7464

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 2
**Assignee:**
**Status:** To Do
**Depends On:** ticket-implement-memory-query-endpoints.md, ticket-implement-memory-read-endpoints.md

## Description

This ticket is for polishing and refining the recently implemented memory and summary endpoints in the Memory Core MCP server. It addresses several minor points that will improve code consistency, cleanliness, and maintainability.

## Acceptance Criteria

1.  **Consistent Service Method Return Structures:**
    -   The `queryMemories` and `querySummaries` service methods should return a `results` property (e.g., `{ count: number, results: object[] }`) to align with the final API response structure.

2.  **Numeric Default Pagination Values:**
    -   Update the route handlers in `memories.mjs` and `summaries.mjs` to use numeric default values for `limit` and `offset` instead of strings.

3.  **Externalize `allowedCategories`:**
    -   The hardcoded `allowedCategories` array in `ai/mcp/server/memory/routes/summaries.mjs` should be moved to a more centralized location, such as the `config.mjs` file, to make it easier to manage.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
>
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
>
> My task is to implement: **MCP Server: Refine Memory Server Endpoints**
>
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-refine-memory-server-endpoints.md before we begin.
