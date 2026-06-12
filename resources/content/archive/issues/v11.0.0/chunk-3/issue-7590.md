---
id: 7590
title: 'Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-21T11:02:20Z'
updatedAt: '2025-10-23T14:58:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7590'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7591 Implement GraphQL Client & Auth Service'
  - '[x] 7592 Migrate Label & Issue Services to GraphQL'
  - '[x] 7593 Migrate PullRequestService to GraphQL'
  - '[x] 7594 Migrate SyncService to GraphQL'
  - '[x] 7595 Finalize GraphQL Migration & Cleanup'
  - '[x] 7598 Finalize MCP Server Config Refactoring'
  - '[x] 7599 Externalize GraphQL Queries for Label and PullRequest Services'
  - '[x] 7600 Update OpenAPI Specification to Reflect GraphQL Data Models'
subIssuesCompleted: 8
subIssuesTotal: 8
blockedBy: []
blocking: []
closedAt: '2025-10-23T14:58:03Z'
---
# Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

To overcome the limitations of the `gh` CLI and build a more scalable and performant foundation for our GitHub integration, this epic outlines the complete migration of our MCP services' data access layer. All remote data-fetching and mutation operations currently using `gh` subprocess calls will be refactored to use direct calls to the official GitHub GraphQL API.

While the `gh` CLI provided a rapid path to a working prototype, it lacks support for critical features (e.g., issue relationships) and is less performant for complex queries. A direct GraphQL implementation will give us full, typed access to the GitHub API, improve performance by consolidating queries, and provide a single, robust data layer for all current and future features.

Operations that perform local Git repository manipulations (e.g., `gh pr checkout`) will be explicitly excluded from this migration and will continue to use the `gh` CLI.

## Key Sub-Tasks

1.  **#7591 - Implement GraphQL Client & Auth Service:**
    -   Add a lightweight HTTP client (`node-fetch`) to `package.json`.
    -   Create a new `GraphqlService` to encapsulate all API calls.
    -   Implement a method within the service to fetch the GitHub auth token from the `gh` CLI (`gh auth token`) and manage the required HTTP headers.

2.  **#7592 - Migrate Label & Issue Services to GraphQL:**
    -   Refactor `LabelService.listLabels` to use a GraphQL query.
    -   Refactor `IssueService.addLabels` and `IssueService.removeLabels` to use GraphQL mutations.

3.  **#7593 - Migrate PullRequestService to GraphQL:**
    -   Refactor `listPullRequests`, `createComment`, and `getConversation` to use GraphQL queries and mutations.
    -   Investigate and refactor `getPullRequestDiff`. Note that `checkoutPullRequest` will remain a `gh` CLI call.

4.  **#7594 - Migrate SyncService to GraphQL:**
    -   Rewrite `#pullFromGitHub` to use a single, comprehensive GraphQL query that fetches issues, comments, and their relationships (parent, children, etc.).
    -   Rewrite `#pushToGitHub` to use a GraphQL mutation for updating issues.
    -   Rewrite `#fetchAndCacheReleases` to use a GraphQL query.

5.  **#7595 - Finalize Migration & Cleanup:**
    -   Remove the generic `#ghCommand` helper method from `SyncService`.
    -   Review all services to ensure no unnecessary `gh` calls remain.
    -   Update all relevant JSDoc comments and documentation to reflect the new GraphQL data access patterns.

## Timeline

- 2025-10-21T11:02:21Z @tobiu assigned to @tobiu
- 2025-10-21T11:02:22Z @tobiu added the `enhancement` label
- 2025-10-21T11:02:22Z @tobiu added the `epic` label
- 2025-10-21T11:02:22Z @tobiu added the `ai` label
- 2025-10-21T11:02:22Z @tobiu added the `refactoring` label
- 2025-10-21T11:04:39Z @tobiu added sub-issue #7591
- 2025-10-21T11:06:10Z @tobiu added sub-issue #7592
- 2025-10-21T11:07:11Z @tobiu added sub-issue #7593
- 2025-10-21T11:08:27Z @tobiu added sub-issue #7594
- 2025-10-21T11:09:25Z @tobiu added sub-issue #7595
- 2025-10-21T11:12:50Z @tobiu referenced in commit `07585d7` - "#7590 tickets as md files"
- 2025-10-21T11:55:16Z @tobiu referenced in commit `df9a3bb` - "#7590 PullRequestService imports formatting"
- 2025-10-22T08:49:33Z @tobiu added sub-issue #7598
- 2025-10-22T09:02:46Z @tobiu added sub-issue #7599
- 2025-10-22T09:17:03Z @tobiu added sub-issue #7600
### @tobiu - 2025-10-23T14:58:03Z

resolved.

- 2025-10-23T14:58:04Z @tobiu closed this issue

