---
id: 7464
title: 'MCP Server: Refine Memory Server Endpoints'
state: CLOSED
labels:
  - enhancement
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-11T18:02:59Z'
updatedAt: '2025-10-13T19:26:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7464'
author: tobiu
commentsCount: 2
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-13T19:26:57Z'
---
# MCP Server: Refine Memory Server Endpoints

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

## Timeline

- 2025-10-11T18:02:59Z @tobiu assigned to @tobiu
- 2025-10-11T18:03:00Z @tobiu added parent issue #7399
- 2025-10-11T18:03:01Z @tobiu added the `enhancement` label
- 2025-10-11T18:03:01Z @tobiu added the `ai` label
- 2025-10-11T18:06:42Z @tobiu cross-referenced by PR #7463
### @Aki-07 - 2025-10-11T18:11:15Z

Can I pick up this refinement @tobiu ?

- 2025-10-11T18:45:29Z @tobiu unassigned from @tobiu
- 2025-10-11T18:45:29Z @tobiu assigned to @Aki-07
- 2025-10-11T18:45:36Z @tobiu added the `hacktoberfest` label
### @tobiu - 2025-10-11T18:45:47Z

sure.

- 2025-10-12T03:13:51Z @Aki-07 cross-referenced by PR #7466
- 2025-10-13T19:26:57Z @tobiu closed this issue

