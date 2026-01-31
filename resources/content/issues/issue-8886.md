---
id: 8886
title: 'fix: Ensure Collection.clear() clears allItems in filtered state'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-26T19:26:40Z'
updatedAt: '2026-01-26T19:30:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8886'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T19:30:17Z'
---
# fix: Ensure Collection.clear() clears allItems in filtered state

The `Collection.clear()` method had a flaw when used on a filtered collection. It only cleared the visible items (`this.items` / `this._items`) but failed to clear the underlying `allItems` collection, which stores the full, unfiltered dataset.

This behavior led to data corruption and retention issues, particularly in scenarios involving:
1.  **Reloading Stores:** When a filtered store was reloaded (cleared and then populated with new data), the old, hidden items remained in `allItems`. This could cause `allItems` to grow indefinitely or contain mixed state from previous loads.
2.  **Massive Data:** In the Big Data Grid example, this manifested as inconsistencies when switching between large datasets while filters were active.

**Resolution:**
The `clear()` method in `src/collection/Base.mjs` has been updated to explicitly call `this.allItems?.clear()` before clearing the local items.

**Regression Test:**
A new unit test file `test/playwright/unit/collection/MassiveData.spec.mjs` has been added. It specifically targets:
-   Adding 10k+ items to a store.
-   Applying filters.
-   Clearing the store.
-   Verifying that `allItems` is correctly emptied.
-   Reloading data and ensuring counts match expectation (no ghost items).
-   Verifying that adding items to a filtered collection correctly updates `allItems` (data loss check).

## Timeline

- 2026-01-26T19:26:41Z @tobiu added the `bug` label
- 2026-01-26T19:26:41Z @tobiu added the `ai` label
- 2026-01-26T19:26:41Z @tobiu added the `testing` label
- 2026-01-26T19:26:59Z @tobiu referenced in commit `cf4ddf4` - "fix: Ensure Collection.clear() clears allItems in filtered state (#8886)"
- 2026-01-26T19:28:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T19:28:13Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix and added the regression test.
> 
> **Changes:**
> 1.  **`src/collection/Base.mjs`**: Updated `clear()` to invoke `this.allItems?.clear()` before splicing. This ensures that the source collection (containing hidden/filtered items) is also wiped.
> 2.  **`test/playwright/unit/collection/MassiveData.spec.mjs`**: Added a comprehensive test suite that:
>     *   Adds 10,000 items to a store.
>     *   Applies a filter.
>     *   Clears the store.
>     *   Verifies `count` is 0.
>     *   Adds *another* 10,000 items.
>     *   Verifies that `allItems` correctly reflects 10,000 items (not 20,000 or a corrupted state).
>     *   Checks for `undefined` items to ensure data integrity.
>     *   Verifies that adding a non-matching item to a filtered collection correctly updates `allItems`.
> 
> The test suite passes successfully.

- 2026-01-26T19:29:49Z @tobiu referenced in commit `30f5d6d` - "fix: Update clearSilent to also clear allItems in filtered collections (#8886)"
### @tobiu - 2026-01-26T19:29:59Z

**Input from Gemini 3 Pro:**

> ✦ I have also updated `clearSilent()` in `src/collection/Base.mjs` to recursively clear `allItems` if it exists. This ensures consistency for silent clear operations as well.

- 2026-01-26T19:30:17Z @tobiu closed this issue

