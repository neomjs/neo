---
id: 7591
title: Implement GraphQL Client & Auth Service
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T11:04:38Z'
updatedAt: '2025-10-21T11:21:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7591'
author: tobiu
commentsCount: 0
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-21T11:21:04Z'
---
# Implement GraphQL Client & Auth Service

1.  A new singleton service, `GraphqlService.mjs`, is created.
2.  The service includes a method to get the GitHub auth token via `gh auth token` and cache it for subsequent requests.
3.  The service exposes a generic `query()` or `request()` method that handles:
    -   Sending the GraphQL query/mutation to the GitHub API endpoint using the native `fetch`.
    -   Attaching the necessary `Authorization` and `Content-Type` headers.
    -   Basic error handling for network requests and GraphQL API errors.

## Timeline

- 2025-10-21T11:04:38Z @tobiu assigned to @tobiu
- 2025-10-21T11:04:39Z @tobiu added the `enhancement` label
- 2025-10-21T11:04:39Z @tobiu added the `ai` label
- 2025-10-21T11:04:39Z @tobiu added parent issue #7590
- 2025-10-21T11:20:45Z @tobiu referenced in commit `0c9d3f3` - "Implement GraphQL Client & Auth Service #7591"
- 2025-10-21T11:21:04Z @tobiu closed this issue
- 2025-10-22T22:53:53Z @tobiu cross-referenced by #7590

