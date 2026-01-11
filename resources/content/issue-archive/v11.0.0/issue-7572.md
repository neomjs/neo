---
id: 7572
title: Implement Dynamic Release Fetching in SyncService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:44:57Z'
updatedAt: '2025-10-20T12:55:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7572'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T12:55:42Z'
---
# Implement Dynamic Release Fetching in SyncService

With the configuration now based on a `syncStartDate`, the `SyncService` must be updated to dynamically fetch release data from GitHub instead of relying on a static list. This fetched data will be used by the archiving logic.

## Acceptance Criteria

1.  A new private method, `#fetchAndCacheReleases()`, is created in `SyncService.mjs`.
2.  This method is called once at the beginning of the `runFullSync()` orchestration.
3.  It executes `gh release list --json tagName,publishedAt --limit 1000` to get all releases.
4.  It filters the fetched releases, keeping only those with a `publishedAt` date on or after the `syncStartDate` from the config.
5.  It sorts the filtered releases by `publishedAt` date in descending order (newest first).
6.  The resulting array of `{ tagName, publishedAt }` objects is stored in an instance property (e.g., `this.releases`) for use by other methods during the sync.

## Benefits

-   Makes the archiving process fully automated and aware of the latest project releases.
-   Eliminates the need for manual configuration updates when a new version is released.
-   Ensures the service has an accurate, up-to-date list of all relevant releases.

## Timeline

- 2025-10-20T12:44:57Z @tobiu assigned to @tobiu
- 2025-10-20T12:44:58Z @tobiu added the `enhancement` label
- 2025-10-20T12:44:58Z @tobiu added parent issue #7564
- 2025-10-20T12:44:59Z @tobiu added the `ai` label
- 2025-10-20T12:55:01Z @tobiu referenced in commit `5d70430` - "Implement Dynamic Release Fetching in SyncService #7572"
- 2025-10-20T12:55:43Z @tobiu closed this issue

