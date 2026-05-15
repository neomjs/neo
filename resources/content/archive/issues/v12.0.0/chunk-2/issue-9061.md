---
id: 9061
title: 'Perf: Enable Turbo Mode for DevRank Store'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T22:53:10Z'
updatedAt: '2026-02-08T22:58:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9061'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T22:58:23Z'
---
# Perf: Enable Turbo Mode for DevRank Store

To handle the scale of 100k+ users, we must enable "Turbo Mode" in the `DevRank.store.Contributors` store.

**Action:**
Set `autoInitRecords: false` in the store configuration.

**Impact:**
-   **Memory:** The Store will initially hold lightweight, minified raw data objects (e.g., `{l: 'tobiu', tc: 1000}`) instead of heavy `Neo.data.Record` instances.
-   **Lazy Instantiation:** `Neo.data.Store.getAt()` lazily converts raw data objects into `Record` instances only when they are accessed (e.g., by the Grid renderer). This distributes the memory and CPU cost over time as the user scrolls, rather than paying it all upfront.
-   **Grid Compatibility:** Fully compatible with the minified schema because `RecordFactory` handles the mapping (`l` -> `login`) during this lazy creation.

This is the final step in the data optimization pipeline.

## Timeline

- 2026-02-08T22:53:11Z @tobiu added the `enhancement` label
- 2026-02-08T22:53:11Z @tobiu added the `ai` label
- 2026-02-08T22:53:12Z @tobiu added the `performance` label
- 2026-02-08T22:57:59Z @tobiu assigned to @tobiu
- 2026-02-08T22:58:18Z @tobiu referenced in commit `4526836` - "perf: Enable Store Turbo Mode (autoInitRecords: false) (#9061)"
- 2026-02-08T22:58:23Z @tobiu closed this issue

