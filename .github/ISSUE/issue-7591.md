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
closedAt: '2025-10-21T11:21:04Z'
---
# Implement GraphQL Client & Auth Service

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7590 - Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

---

1.  A new singleton service, `GraphqlService.mjs`, is created.
2.  The service includes a method to get the GitHub auth token via `gh auth token` and cache it for subsequent requests.
3.  The service exposes a generic `query()` or `request()` method that handles:
    -   Sending the GraphQL query/mutation to the GitHub API endpoint using the native `fetch`.
    -   Attaching the necessary `Authorization` and `Content-Type` headers.
    -   Basic error handling for network requests and GraphQL API errors.

