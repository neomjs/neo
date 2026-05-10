---
id: 9334
title: 'Performance: Optimize Collection `items_` config to use shallow cloning'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-27T16:34:32Z'
updatedAt: '2026-02-27T17:13:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9334'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T17:13:04Z'
---
# Performance: Optimize Collection `items_` config to use shallow cloning

### Problem
The `items_` config in `Neo.collection.Base` was defaulting to `clone: 'deep'` (the default for reactive configs in Neo.mjs). For large datasets (e.g., 50,000 records in the DevIndex app), setting or initializing `items_` triggered a deep clone of the entire array and every single record object within it. This caused a massive performance bottleneck, specifically an ~800ms delay when the `allItems` collection was created during the first filter operation.

### Solution
Updated the `items_` config to use a descriptor with `clone: 'shallow'`. This ensures that only the array structure itself is copied (preserving immutability for the collection array) while the individual record objects maintain their exact references. This drops the `items` assignment overhead for 50k records from ~779ms down to ~6ms, eliminating the bottleneck while ensuring updates to records propagate correctly between filtered and unfiltered states.

## Timeline

- 2026-02-27T16:34:33Z @tobiu added the `enhancement` label
- 2026-02-27T16:34:33Z @tobiu added the `ai` label
- 2026-02-27T16:34:33Z @tobiu added the `performance` label
- 2026-02-27T16:37:40Z @tobiu referenced in commit `bcd697d` - "enhancement: Performance: Optimize Collection `items_` config to use shallow cloning (#9334)"
- 2026-02-27T17:10:16Z @tobiu referenced in commit `06ae779` - "enhancement: Performance: Optimize Collection `items_` config to use shallow cloning (#9334)"
- 2026-02-27T17:11:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T17:11:48Z

**Input from Gemini 3.1 Pro:**

> ✦ I have resolved this issue.
> 
> * We discovered that `Neo.cloneMap.Object` was being triggered repeatedly for all 50k records and their properties because the `items_` config in `Neo.collection.Base` lacked a clone descriptor, causing it to fall back to the default `clone: 'deep'` mechanism on assignment.
> * We fixed this by providing a config descriptor for `items_` in `src/collection/Base.mjs` explicitly setting `clone: 'shallow'`. This avoids the expensive full depth clone, performing just `[...value]` to ensure collection immutability while preserving standard object references for the individual items.
> * We also fixed a synchronization issue where the initial `afterSetSourceId` hook wasn't updating `me.count` after cloning the source collection data directly.
> * A performance regression test was created in `test/playwright/unit/app/devindex/StoreFilterProfile.spec.mjs` with an explicit assertion to enforce that the initial hydration/filter creation process takes less than 400ms (down from the ~1000ms+ range previously).
> 
> The issue is resolved and the relevant unit tests all pass!

- 2026-02-27T17:13:04Z @tobiu closed this issue

