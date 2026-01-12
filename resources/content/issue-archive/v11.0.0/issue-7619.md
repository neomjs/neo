---
id: 7619
title: Refactor Magic Number for Release Fetching Pagination
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-23T11:35:57Z'
updatedAt: '2025-10-23T11:38:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7619'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-23T11:38:54Z'
---
# Refactor Magic Number for Release Fetching Pagination

In `ai/mcp/server/github-workflow/services/SyncService.mjs`, the `FETCH_RELEASES` GraphQL query is called with a hardcoded `limit: 100`. This is a "magic number" that should be defined in a central configuration file for better maintainability.

```javascript
// ai/mcp/server/github-workflow/services/SyncService.mjs

const data = await GraphqlService.query(FETCH_RELEASES, {
    owner: aiConfig.owner,
    repo : aiConfig.repo,
    limit: 100, // This should be a config value
    cursor
});
```

### Task

1.  Move this hardcoded value to the `issueSync` section of the configuration file at `@ai/mcp/server/github-workflow/config.mjs`.
2.  Create a new property named `releaseQueryLimit`.
3.  Update `SyncService.mjs` to import and use this new configuration value.

### Discussion on Value

We should also evaluate if `100` is the optimal value.

*   **Pro (High Value):** A larger number like 100 is efficient for the initial, full synchronization, as it reduces the number of round-trips to the GitHub API.
*   **Con (High Value):** When there are only 1-2 new releases, fetching 100 is wasteful and consumes more API quota than necessary.

A value of **50** is proposed as a more balanced compromise. It significantly reduces the data fetched during incremental updates while remaining reasonably efficient for the initial full sync.

## Timeline

- 2025-10-23T11:35:57Z @tobiu assigned to @tobiu
- 2025-10-23T11:35:59Z @tobiu added the `enhancement` label
- 2025-10-23T11:35:59Z @tobiu added the `ai` label
- 2025-10-23T11:35:59Z @tobiu added the `refactoring` label
- 2025-10-23T11:38:38Z @tobiu referenced in commit `75e947d` - "Refactor Magic Number for Release Fetching Pagination #7619"
- 2025-10-23T11:38:55Z @tobiu closed this issue

