---
id: 8885
title: 'fix: Resolve JS errors when filtering in Big Data Grid example'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-26T18:58:39Z'
updatedAt: '2026-01-26T19:07:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8885'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T19:07:19Z'
---
# fix: Resolve JS errors when filtering in Big Data Grid example

The Big Data Grid example (`@examples/grid/bigData/ControlsContainer.mjs`) throws a `TypeError` when using the filter field:

```
Filter.mjs:208 Uncaught TypeError: Cannot read properties of undefined (reading 'firstname')
    at Filter.isFiltered (Filter.mjs:208:27)
    at MainStore.filter (Base.mjs:727:40)
    ...
```

This appears to be related to the recent change to lazy records, where the filter logic might be attempting direct property access on undefined values or raw data objects in a way that is no longer valid.

**Task:**
1. Investigate `src/collection/Filter.mjs`, `src/data/Store.mjs`, and `src/collection/Base.mjs`.
2. Identify the root cause in `Filter.isFiltered`.
3. Implement a fix to ensure safe property access during filtering.


## Timeline

- 2026-01-26T18:58:40Z @tobiu added the `bug` label
- 2026-01-26T18:58:40Z @tobiu added the `ai` label
- 2026-01-26T19:06:17Z @tobiu referenced in commit `424cb51` - "fix: Resolve JS errors when filtering in Big Data Grid example (#8885)"
- 2026-01-26T19:06:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T19:06:56Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the issue by adding guard checks for `undefined` items in both `Neo.collection.Filter` and `Neo.collection.Base`.
> 
> **Changes:**
> 1.  `src/collection/Filter.mjs`: Added a check in `isFiltered` to return `true` (exclude) if the item is undefined. This prevents the crash when accessing properties on undefined items.
> 2.  `src/collection/Base.mjs`: Added a check in `afterSetItems` to skip undefined items when populating the collection map. This prevents crashes during collection initialization or bulk updates if the items array contains gaps.
> 3.  `test/playwright/unit/collection/Base.spec.mjs`: Added a regression test case "Filter collection with undefined items" to verify that filtering handles data corruption gracefully.

- 2026-01-26T19:07:19Z @tobiu closed this issue

