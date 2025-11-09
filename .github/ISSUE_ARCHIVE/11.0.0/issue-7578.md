---
id: 7578
title: Harden Release Caching and Add Fallback
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:24:08Z'
updatedAt: '2025-10-21T08:10:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7578'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-21T08:10:05Z'
---
# Harden Release Caching and Add Fallback

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

The `#fetchAndCacheReleases` method needs to be hardened to handle the edge case where no releases are found after the `syncStartDate`. Additionally, the fallback version for archiving should be made configurable.

## Acceptance Criteria

1.  A new property, `defaultArchiveVersion`, is added to the `githubWorkflow.issueSync` object in `config.mjs` with a value like `'unversioned'`.
2.  The `#fetchAndCacheReleases` method in `SyncService.mjs` is updated to log a warning if `this.releases` is empty after filtering.
3.  The `#getIssuePath` method is updated to use the new `defaultArchiveVersion` from the config as its fallback value instead of the hardcoded `'unknown'`.

