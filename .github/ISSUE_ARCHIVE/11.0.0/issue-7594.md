---
id: 7594
title: Migrate SyncService to GraphQL
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T11:08:26Z'
updatedAt: '2025-10-21T19:15:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7594'
author: tobiu
commentsCount: 0
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T19:15:13Z'
---
# Migrate SyncService to GraphQL

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7590 - Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

---

This is the largest part of the GraphQL migration, focusing on the complete refactoring of the `SyncService` to use the new `GraphqlService`.

## Acceptance Criteria

1.  The `#pullFromGitHub` method is rewritten to use a single, comprehensive GraphQL query that fetches a batch of issues along with their nested data, including labels, assignees, comments, and **issue relationships** (parent, children, blocking, blockedBy).
2.  The `#pushToGitHub` method is rewritten to use a GraphQL mutation to update issue titles and bodies.
3.  The `#fetchAndCacheReleases` method is rewritten to use a GraphQL query.
4.  The old `#ghCommand` helper method is removed from the service.

