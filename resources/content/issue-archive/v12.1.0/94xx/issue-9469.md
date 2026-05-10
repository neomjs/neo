---
id: 9469
title: 'TreeStore: internalIdMap desyncs after bulk operations (expandAll), breaking selection'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-13T18:17:22Z'
updatedAt: '2026-03-13T18:32:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9469'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T18:18:25Z'
---
# TreeStore: internalIdMap desyncs after bulk operations (expandAll), breaking selection

The `#rebuildKeysAndCount` method in `Neo.data.TreeStore` was successfully rebuilding the main map, but it failed to synchronize the `internalIdMap`. 

Because `expandAll` (and similar bulk operations) deliberately bypass the standard `me.items = newItems` setter to maintain Turbo Mode efficiency, it must manually replicate the internal map synchronization.

Without this, when a user clicks on a row after `expandAll`, the `SelectionModel` resolves the event target to an `internalId` (`data-record-id`), but the `internalIdMap` is stale. This causes `getRow` to fail, returning `null`, and resulting in no selection being applied visually.

**Fix:**
- Updated `#rebuildKeysAndCount` to clear and properly populate `me.internalIdMap` when `me.trackInternalId` is true.
- Declared the loop variables (`internalId`, `item`, `key`) outside of the `for` loop for V8 optimization, as this method operates on potentially massive arrays.
- Added comprehensive E2E tests inside `test/playwright/e2e/GridTreeBigData.spec.mjs` to explicitly cover these edge cases ("Selection happy path" and "Selection persists correctly after structural changes (BUG REPRODUCTION)").
- Added a specific unit test in `test/playwright/unit/data/TreeStore.spec.mjs` to prove the exact hydration mechanic and `indexOf` stability.

## Timeline

- 2026-03-13T18:17:23Z @tobiu added the `bug` label
- 2026-03-13T18:17:23Z @tobiu added the `ai` label
- 2026-03-13T18:17:45Z @tobiu referenced in commit `223963c` - "fix(data.TreeStore): Properly sync internalIdMap in #rebuildKeysAndCount after bulk operations to prevent selection failures (#9469)"
- 2026-03-13T18:17:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-13T18:18:04Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully committed and pushed the fix along with the E2E and unit test coverage. The `internalIdMap` desynchronization has been fully resolved.

- 2026-03-13T18:18:25Z @tobiu closed this issue
- 2026-03-13T18:30:34Z @tobiu referenced in commit `3cb518d` - "docs(data.TreeStore): Document internalIdMap synchronization requirements in #rebuildKeysAndCount for Turbo Mode (#9469)"
### @tobiu - 2026-03-13T18:31:05Z

**Input from Gemini 3.1 Pro:**

> ✦ Following up:
> - I removed the temporary `console.log` statements from both the E2E and Unit test files.
> - I applied the "Anchor & Echo" Knowledge Base Enhancement Strategy to `#rebuildKeysAndCount`, documenting the exact architectural reasoning behind why `getInternalId()` MUST be called to synchronize the `internalIdMap` in Turbo Mode. 
> - These final test cleanups and documentation updates have been committed and pushed to `dev`.

### @tobiu - 2026-03-13T18:32:18Z

**Input from Gemini 3.1 Pro:**

> ✦ To clarify the *actual* root cause for future reference: 
> 
> While synchronizing the `internalIdMap` inside `#rebuildKeysAndCount` was the correct architectural step, the initial attempt still failed in **Turbo Mode**.
> 
> The critical 1-liner fix was changing:
> `internalId = me.getInternalKey(item);`
> to:
> `internalId = me.getInternalId(item);`
> 
> **Why?**
> In Turbo Mode (`autoInitRecords: false`), the `_items` array contains raw data objects. `getInternalKey()` only reads an existing `[Symbol.for('Neo.internalId')]`, which is `undefined` on raw objects that haven't been rendered yet. 
> `getInternalId()`, on the other hand, *forces* the creation of the ID if it doesn't exist. Without this, the `internalIdMap` was completely ignoring the unhydrated nodes, causing `RowModel` selections to fail when trying to map the DOM's `data-record-id` back to the record!

- 2026-03-13T18:36:41Z @tobiu referenced in commit `ee2c3fe` - "chore: Add test-e2e script to package.json (#9469)"

