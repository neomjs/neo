---
id: 7595
title: Finalize GraphQL Migration & Cleanup
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-21T11:09:24Z'
updatedAt: '2025-10-23T14:57:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7595'
author: tobiu
commentsCount: 1
parentIssue: 7590
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T14:57:51Z'
---
# Finalize GraphQL Migration & Cleanup

**Reported by:** @tobiu on 2025-10-21

---

**Parent Issue:** #7590 - Epic: Migrate GitHub MCP Services from GH CLI to GraphQL API

---

This is the final ticket in the GraphQL migration epic. It covers the final cleanup and verification steps to ensure the migration is complete and the codebase is consistent.

## Acceptance Criteria

1.  A full review of all migrated services (`IssueService`, `LabelService`, `PullRequestService`, `SyncService`) is conducted to ensure no unnecessary `gh` CLI calls remain for remote data operations.
2.  The old generic `#ghCommand` helper method is confirmed to be removed.
3.  All relevant JSDoc comments throughout the services are updated to reflect the new GraphQL data access patterns and return structures.
4.  The `openapi.yaml` file is reviewed and updated to reflect any changes in the data structures returned by the services.

## Comments

### @tobiu - 2025-10-23 14:57

resolved.

