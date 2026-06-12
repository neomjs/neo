---
id: 8908
title: 'Regression: Big Data Grid filters regenerate data and reset row count'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-30T09:42:27Z'
updatedAt: '2026-01-30T09:45:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8908'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T09:45:57Z'
---
# Regression: Big Data Grid filters regenerate data and reset row count

### Description
In the Big Data Grid example (`examples/grid/bigData`), filtering causes the entire dataset to be regenerated and reset to the default row count (1000), even if the user had previously loaded a different amount (e.g., 100k).

### Root Cause
The `MainStore` class has reactive configs (`amountRows_`, `amountColumns_`) that trigger data generation in their `afterSet` hooks.

When `Collection.filter()` runs for the first time, it creates a shadow collection `allItems` to preserve the unfiltered state. It uses `me.constructor` (i.e., `MainStore`) to create this instance.

1. `allItems` is instantiated as a `MainStore`.
2. The current items (e.g., 100k records) are passed to the constructor.
3. The `amountRows` config (defaulting to 1000 in `originalConfig`) is applied, triggering `afterSetAmountRows`.
4. `afterSetAmountRows` blindly calls `this.clear()` and `this.generateData()`.
5. This wipes the 100k preserved items and replaces them with 1000 newly generated random records.
6. The filter then operates on this incorrect dataset.

### Fix
Modify `examples/grid/bigData/MainStore.mjs` to check for `this.sourceId` in the data generation hooks. If `sourceId` is present, it indicates the store is operating as a shadow/linked collection (like `allItems`), and it should NOT generate its own data or clear existing items.

### Impact
- `examples/grid/bigData/MainStore.mjs`

### Proposed Changes
Add `if (this.sourceId) return;` to:
- `afterSetAmountColumns`
- `afterSetAmountRows`

## Timeline

- 2026-01-30T09:42:28Z @tobiu added the `bug` label
- 2026-01-30T09:42:28Z @tobiu added the `ai` label
- 2026-01-30T09:42:28Z @tobiu added the `regression` label
- 2026-01-30T09:45:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T09:45:31Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to `examples/grid/bigData/MainStore.mjs`. The `afterSetAmountRows` and `afterSetAmountColumns` hooks now check for `this.sourceId` and return early if present. This prevents the shadow collection (`allItems`) used by the filtering logic from incorrectly regenerating data and resetting the store state.
> 
> Changes committed in `2e26baa9f`.

- 2026-01-30T09:45:44Z @tobiu referenced in commit `2e26baa` - "fix: Big Data Grid filters regenerate data and reset row count (#8908)"
- 2026-01-30T09:45:57Z @tobiu closed this issue

