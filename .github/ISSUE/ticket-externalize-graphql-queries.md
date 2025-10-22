---
title: "Externalize GraphQL Queries for Label and PullRequest Services"
labels: enhancement, refactoring, AI
---

GH ticket id: #7599

**Epic:** #7590
**Assignee:**
**Status:** To Do

## Description

To improve code organization, maintainability, and consistency across the GitHub workflow server, we need to refactor the remaining services to externalize their GraphQL queries. The `SyncService` and `issueQueries.mjs` have established a clean pattern of separating query logic from service logic. This ticket applies that same pattern to the `LabelService` and `PullRequestService`.

## Acceptance Criteria

1.  A new file, `ai/mcp/server/github-workflow/services/queries/labelQueries.mjs`, is created.
2.  The GraphQL query for listing labels is moved from `LabelService.mjs` into `labelQueries.mjs` as a named export.
3.  `LabelService.mjs` is updated to import and use the query from the new file.
4.  A new file, `ai/mcp/server/github-workflow/services/queries/pullRequestQueries.mjs`, is created.
5.  The GraphQL queries and mutations for `listPullRequests`, `createComment`, and `getConversation` are moved from `PullRequestService.mjs` into `pullRequestQueries.mjs` as named exports.
6.  `PullRequestService.mjs` is updated to import and use the queries from the new file.
7.  The new query modules should export default limit variables (e.g., `DEFAULT_QUERY_LIMITS`) if applicable, sourcing values from the config to avoid magic numbers, similar to the pattern in `issueQueries.mjs`.
