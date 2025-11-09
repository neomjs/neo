---
id: 7618
title: Optimize SyncService Release Fetching
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-23T11:13:12Z'
updatedAt: '2025-10-23T11:31:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7618'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T11:31:16Z'
---
# Optimize SyncService Release Fetching

**Reported by:** @tobiu on 2025-10-23

The `SyncService` currently fetches all GitHub releases on every `runFullSync()` call. For a repository with a large number of releases like `neo.mjs` (over 1100), this is highly inefficient and slow, requiring more than 10 paginated GraphQL queries. This adds around 5 seconds to the sync duration, even when no new releases have been published.

The GitHub GraphQL API for releases does not support a `since` parameter, preventing a simple delta query.

### Proposed Solution

Implement a two-phase fetching strategy to drastically reduce the time for "no-op" syncs (when no new releases exist) and optimize the full fetch.

**Phase 1: Quick Check**

1.  Create a new, lightweight GraphQL query (`FETCH_LATEST_RELEASE`) to fetch only the single latest release.
2.  Before the main fetch, execute this query.
3.  Compare the `tagName` and `publishedAt` timestamp of this latest release with the latest release cached in `.sync-metadata.json`.
4.  If they match, the local cache is up-to-date. Skip the full fetch entirely.

**Phase 2: Optimized Full Fetch with Early Exit**

1.  If the quick check fails or no cache exists, proceed with the paginated `FETCH_RELEASES` query.
2.  In each pagination loop, inspect the `publishedAt` date of the *oldest* release in the current batch.
3.  If this date is older than our `syncStartDate` from the configuration, we can safely assume no more relevant releases will be found. Break the pagination loop immediately.

**Caching**

1.  After a successful full fetch, the complete, sorted list of relevant releases will be saved into the `.sync-metadata.json` file.
2.  This cached data will be used for the "Quick Check" in the subsequent run.

### Expected Performance Impact

-   **No-Op Sync (No new releases):** Release check time should drop from ~5 seconds to ~100 milliseconds (a ~98% improvement).
-   **Full Sync (New releases):** The number of GraphQL queries will be reduced by exiting early, saving 1-3 seconds depending on how many releases are newer than the `syncStartDate`.

