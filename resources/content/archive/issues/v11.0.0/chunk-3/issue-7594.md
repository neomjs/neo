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
blockedBy: []
blocking: []
closedAt: '2025-10-21T19:15:13Z'
---
# Migrate SyncService to GraphQL

This is the largest part of the GraphQL migration, focusing on the complete refactoring of the `SyncService` to use the new `GraphqlService`.

## Acceptance Criteria

1.  The `#pullFromGitHub` method is rewritten to use a single, comprehensive GraphQL query that fetches a batch of issues along with their nested data, including labels, assignees, comments, and **issue relationships** (parent, children, blocking, blockedBy).
2.  The `#pushToGitHub` method is rewritten to use a GraphQL mutation to update issue titles and bodies.
3.  The `#fetchAndCacheReleases` method is rewritten to use a GraphQL query.
4.  The old `#ghCommand` helper method is removed from the service.

## Timeline

- 2025-10-21T11:08:26Z @tobiu assigned to @tobiu
- 2025-10-21T11:08:27Z @tobiu added the `enhancement` label
- 2025-10-21T11:08:27Z @tobiu added parent issue #7590
- 2025-10-21T11:08:28Z @tobiu added the `ai` label
- 2025-10-21T19:15:09Z @tobiu referenced in commit `2696ac1` - "Migrate SyncService to GraphQL #7594"
- 2025-10-21T19:15:14Z @tobiu closed this issue
- 2025-10-22T22:53:53Z @tobiu cross-referenced by #7590

