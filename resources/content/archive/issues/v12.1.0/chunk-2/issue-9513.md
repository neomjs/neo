---
id: 9513
title: Optimize Grid Value Banding (startIndex Support)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-18T15:03:52Z'
updatedAt: '2026-03-18T15:04:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9513'
author: tobiu
commentsCount: 0
parentIssue: 9511
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T15:04:57Z'
---
# Optimize Grid Value Banding (startIndex Support)

Optimization sub-task for #9511 and #9512 to improve `collection.Base` `calcValueBands` for large datasets.

**Changes:**
1. **Partial Recalculation:** `calcValueBands` now supports an optional `startIndex`. When passed (e.g. from `splice`), the algorithm retrieves the banding state from the preceding item and only recalculates for the affected subset of the array.
2. **Sparse Array Support:** Added a check for missing items (`items[i]`) within the calculation loop to prevent crashes when dealing with sparse arrays or buffered data loading.
3. **Map Persistence:** The `valueBandsMap` is no longer fully cleared unless a full recalculation (`startIndex === 0`) is requested, reducing GC churn.

Verified with existing test suite `test/playwright/unit/data/StoreValueBandingCount.spec.mjs`.

## Timeline

- 2026-03-18T15:03:54Z @tobiu added the `enhancement` label
- 2026-03-18T15:03:54Z @tobiu added the `ai` label
- 2026-03-18T15:03:54Z @tobiu added the `performance` label
- 2026-03-18T15:03:54Z @tobiu added the `grid` label
- 2026-03-18T15:04:27Z @tobiu added parent issue #9511
- 2026-03-18T15:04:31Z @tobiu referenced in commit `9de5ab2` - "perf(collection): Optimize value banding via startIndex support (#9513)"
- 2026-03-18T15:04:39Z @tobiu assigned to @tobiu
- 2026-03-18T15:04:58Z @tobiu closed this issue

