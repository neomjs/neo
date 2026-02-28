---
id: 9331
title: 'Store: Prevent soft hydration for inactive/null filters in Turbo Mode'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-27T11:22:48Z'
updatedAt: '2026-02-27T11:25:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9331'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T11:25:23Z'
---
# Store: Prevent soft hydration for inactive/null filters in Turbo Mode

In "Turbo Mode" (`autoInitRecords: false`), the `Store#filter` and `Store#isFilteredItem` methods perform "Soft Hydration" to resolve missing fields on raw data objects. 

Currently, they hydrate properties for *all* filters in the `store.filters` array, even if the filter has `value: null` (meaning it's effectively inactive).

For complex calculated fields (like `commitRatio` in DevIndex, which triggers 100k+ `reduce` calls), this causes a massive, multi-second performance penalty when a user changes a completely unrelated, simple filter (like Country).

**Fix:**
Update `src/data/Store.mjs` so that `filter()` and `isFilteredItem()` only hydrate properties for filters where `!filter.disabled && filter.value !== null`. This ensures we only pay the heavy calculation penalty when a user actually activates that specific filter.

## Timeline

- 2026-02-27T11:22:49Z @tobiu added the `enhancement` label
- 2026-02-27T11:22:49Z @tobiu added the `ai` label
- 2026-02-27T11:24:28Z @tobiu referenced in commit `10c6488` - "perf(Store): Prevent soft hydration for inactive/null filters in Turbo Mode (#9331)"
- 2026-02-27T11:24:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T11:25:05Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the optimization in `src/data/Store.mjs`.
> 
> Both `filter()` and `isFilteredItem()` now check for `!f.disabled && f.value !== null` before performing Soft Hydration. This prevents executing heavy calculate loops (like `commitRatio` in DevIndex) for 50,000 items when those filters aren't actively being used.
> 
> Changes have been committed and pushed to `dev`. Closing this ticket.

- 2026-02-27T11:25:23Z @tobiu closed this issue

