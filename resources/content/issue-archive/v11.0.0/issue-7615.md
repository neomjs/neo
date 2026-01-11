---
id: 7615
title: 'Optimize GitHub Issue Sync: Dynamic `syncStartDate` for Delta Updates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-22T23:12:43Z'
updatedAt: '2025-10-22T23:14:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7615'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T23:14:15Z'
---
# Optimize GitHub Issue Sync: Dynamic `syncStartDate` for Delta Updates

This ticket documents an important optimization implemented in the GitHub issue synchronization service (`SyncService.mjs`).

**Problem:**
Previously, the `pullFromGitHub` method in `SyncService.mjs` used a static `issueSyncConfig.syncStartDate` value when querying GitHub for updated issues. This meant that even for incremental updates, the service would fetch all issues updated since a potentially very old `syncStartDate`, leading to unnecessary data transfer and processing, and resulting in slow synchronization times even when only a few issues had changed. The issue was particularly noticeable when all local issue folders were deleted, triggering a full re-sync that took approximately 20 seconds.

**Solution:**
The `pullFromGitHub` method has been modified to dynamically use `metadata.lastSync` as the `since` parameter for the `FETCH_ISSUES_FOR_SYNC` GraphQL query. This ensures that subsequent synchronizations only fetch issues that have been updated on GitHub since the *last successful sync*. If `metadata.lastSync` is not available (e.g., on the very first sync or after a metadata reset), it falls back to the configured `issueSyncConfig.syncStartDate`.

**Impact:**
- **Improved Performance:** Incremental synchronizations are now significantly faster as only truly updated issues are fetched and processed.
- **Reduced API Usage:** Less data is transferred from GitHub, conserving API rate limits.
- **Correct Delta Logic:** The synchronization now correctly implements delta updates based on the last successful sync timestamp.

**Files Changed:**
- `ai/mcp/server/github-workflow/services/SyncService.mjs`

**Verification:**
- Observe faster sync times for incremental updates.
- Verify that deleting all local issue folders still triggers a full re-sync, which is expected behavior.

## Timeline

- 2025-10-22T23:12:43Z @tobiu assigned to @tobiu
- 2025-10-22T23:12:44Z @tobiu added the `enhancement` label
- 2025-10-22T23:13:24Z @tobiu referenced in commit `6011365` - "Optimize GitHub Issue Sync: Dynamic syncStartDate for Delta Updates #7615"
- 2025-10-22T23:14:16Z @tobiu closed this issue

