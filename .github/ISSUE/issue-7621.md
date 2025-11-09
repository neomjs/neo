---
id: 7621
title: Refactor IssueService to Externalize GraphQL Queries
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-23T13:25:11Z'
updatedAt: '2025-10-23T13:26:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7621'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T13:26:31Z'
---
# Refactor IssueService to Externalize GraphQL Queries

**Reported by:** @tobiu on 2025-10-23

The `ai/mcp/server/github-workflow/services/IssueService.mjs` currently contains inline GraphQL query and mutation strings. This violates the separation of concerns principle we have established, where all GraphQL operations should be defined in dedicated files within the `services/queries/` directory.

### Queries and Mutations to Externalize

1.  **`#getIds` Query:** The query inside this private method fetches the GraphQL node ID for an issue and the node IDs for a set of labels. This query should be moved to `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs`.
2.  **`addLabels` Mutation:** The mutation string for adding labels should be moved to `ai/mcp/server/github-workflow/services/queries/mutations.mjs`.
3.  **`removeLabels` Mutation:** The mutation string for removing labels should also be moved to `ai/mcp/server/github-workflow/services/queries/mutations.mjs`.

### Task

1.  Define a new `GET_ISSUE_AND_LABEL_IDS` query in `issueQueries.mjs` and remove the inline version from `IssueService.mjs`.
2.  Define new `ADD_LABELS` and `REMOVE_LABELS` mutations in `mutations.mjs` and remove the inline versions from `IssueService.mjs`.
3.  Update `IssueService.mjs` to import and use these new, externalized GraphQL operations.
4.  Ensure all functionality remains the same after the refactoring.

