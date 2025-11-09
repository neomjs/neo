---
id: 7576
title: Fix and Verify GitHub API Field Names in SyncService
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:21:01Z'
updatedAt: '2025-10-20T14:03:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7576'
author: tobiu
commentsCount: 1
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T14:03:37Z'
---
# Fix and Verify GitHub API Field Names in SyncService

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

A code review has highlighted a critical potential bug: a mismatch between the JSON fields requested from the `gh` CLI (which often use camelCase like `createdAt`) and the fields it actually returns (which may use snake_case like `created_at`). This ticket covers verifying the correct field names and standardizing their usage throughout the `SyncService` to prevent runtime errors.

## Acceptance Criteria

1.  The actual JSON output of `gh issue view <N> --json createdAt,created_at,author,user` and `gh release view <T> --json publishedAt,published_at` is inspected to definitively identify the correct field names returned by the API.
2.  All `gh` CLI calls in `SyncService.mjs` are updated to request the correct, verified field names.
3.  All property accessors within the service's logic (e.g., `issue.createdAt` vs. `issue.created_at`) are updated to match the verified API response, ensuring consistency.
4.  A new unit or integration test is created to validate the field name mappings for a sample issue and release payload, preventing future regressions.

## Comments

### @tobiu - 2025-10-20 14:03

verified field names, no changes needed.

