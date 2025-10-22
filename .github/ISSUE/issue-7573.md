---
id: 7573
title: Filter GitHub Issues by Date in SyncService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:46:00Z'
updatedAt: '2025-10-20T12:57:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7573'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T12:57:55Z'
---
# Filter GitHub Issues by Date in SyncService

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

To significantly improve the performance and reduce the scope of the issue synchronization, the `#pullFromGitHub` method must be updated to process only the issues relevant to our configured time window.

## Acceptance Criteria

1.  The `#pullFromGitHub()` method in `SyncService.mjs` is updated.
2.  After fetching the full list of issues from GitHub, the method filters the array.
3.  The filter logic should only keep issues where `createdAt >= syncStartDate` OR `updatedAt >= syncStartDate`.
4.  Only the issues that pass this filter are processed for local file creation, updates, or deletion.

## Benefits

-   Drastically reduces the number of issues processed during a sync, improving performance.
-   Prevents the local repository from being cluttered with thousands of irrelevant, legacy issues.
-   Focuses the synchronization effort on active and recent work items.

