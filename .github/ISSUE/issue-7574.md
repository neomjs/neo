---
id: 7574
title: Update Archiving Logic to Use Dynamic Release Data
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:48:13Z'
updatedAt: '2025-10-20T12:59:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7574'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T12:59:31Z'
---
# Update Archiving Logic to Use Dynamic Release Data

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

The issue archiving logic in `#getIssuePath()` is currently tied to a static configuration. It needs to be refactored to use the dynamic list of releases fetched from GitHub at the start of the sync process.

## Acceptance Criteria

1.  The `#getIssuePath()` method in `SyncService.mjs` is refactored.
2.  When determining the version for a closed issue, the method no longer references a static config.
3.  Instead, it iterates over the `this.releases` array (populated by `#fetchAndCacheReleases()`).
4.  It correctly identifies the target version by finding the first release in the sorted list whose `publishedAt` date is after the issue's `closedAt` date.
5.  The logic for handling issues with an explicit `milestone` remains as a priority.

## Benefits

-   Completes the transition to a fully dynamic, date-based synchronization system.
-   Ensures that closed issues are always archived into the correct, most recent release folder without manual intervention.
-   Makes the archiving logic resilient to changes in the project's release cadence.

