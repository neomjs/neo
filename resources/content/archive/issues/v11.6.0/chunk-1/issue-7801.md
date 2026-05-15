---
id: 7801
title: Refactor services to use config directly instead of DEFAULT_QUERY_LIMITS
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T10:00:17Z'
updatedAt: '2025-11-19T10:09:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7801'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T10:09:35Z'
---
# Refactor services to use config directly instead of DEFAULT_QUERY_LIMITS

`DEFAULT_QUERY_LIMITS` is defined in `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs` and `ai/mcp/server/github-workflow/services/queries/pullRequestQueries.mjs`. These constants merely re-map values from `ai/mcp/server/github-workflow/config.mjs` to query variable names, creating unnecessary indirection.

The `config.mjs` file should be the single source of truth used directly by the services constructing the queries.

**Tasks:**
1. Remove `DEFAULT_QUERY_LIMITS` from `ai/mcp/server/github-workflow/services/queries/issueQueries.mjs`.
2. Update `ai/mcp/server/github-workflow/services/IssueService.mjs` and `ai/mcp/server/github-workflow/services/sync/IssueSyncer.mjs` to assign query variables (e.g., `maxLabels`, `maxAssignees`) directly from `aiConfig.issueSync`.
3. Remove `DEFAULT_QUERY_LIMITS` from `ai/mcp/server/github-workflow/services/queries/pullRequestQueries.mjs`.
4. Update `ai/mcp/server/github-workflow/services/PullRequestService.mjs` to assign query variables directly from `aiConfig.pullRequest` (or `aiConfig.issueSync` where applicable).

## Timeline

- 2025-11-19T10:00:18Z @tobiu added the `enhancement` label
- 2025-11-19T10:00:18Z @tobiu added the `ai` label
- 2025-11-19T10:00:19Z @tobiu added the `refactoring` label
- 2025-11-19T10:00:37Z @tobiu assigned to @tobiu
- 2025-11-19T10:09:26Z @tobiu referenced in commit `669f85f` - "Refactor services to use config directly instead of DEFAULT_QUERY_LIMITS #7801"
- 2025-11-19T10:09:35Z @tobiu closed this issue

