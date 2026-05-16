---
id: 9434
title: 'TreeStore: Decouple clearFilters() from legacy allItems pattern'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-10T14:26:41Z'
updatedAt: '2026-03-10T15:28:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9434'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T15:28:19Z'
---
# TreeStore: Decouple clearFilters() from legacy allItems pattern

### Goal
Refactor `clearFilters()` in `TreeStore` to utilize the native `_keptNodes` masking logic rather than relying on `Collection.Base`'s `allItems` cloning fallback.

### Context
Standard `Neo.data.Store` filtering works by cloning the entire dataset into an `allItems` collection so it remembers the unfiltered state. 
Our custom `TreeStore.filter()` bypasses this because it relies entirely on `#allRecordsMap` as the ultimate source of truth, masking the projection using a `_keptNodes` Set. 
Currently, if a developer clears the filters, it might trigger the inherited `Collection.Base` logic, which expects `allItems` to exist. 

### Acceptance Criteria
- Override `clearFilters()` in `TreeStore.mjs`.
- The method should nullify or clear `this._keptNodes`.
- The method should completely rebuild the flat `_items` projection (`collectVisibleDescendants`) from the root nodes.
- Do not let it fallback to `super.clearFilters()` if that triggers `allItems` manipulation.
- Fire a standard `filter` event with `isFiltered: false`.
- Write a unit test verifying that `clearFilters()` successfully restores the entire visible tree hierarchy without data loss.

## Timeline

- 2026-03-10T14:26:42Z @tobiu added the `enhancement` label
- 2026-03-10T14:26:42Z @tobiu added the `ai` label
- 2026-03-10T14:26:42Z @tobiu added the `refactoring` label
- 2026-03-10T14:26:43Z @tobiu added the `architecture` label
- 2026-03-10T14:27:18Z @tobiu added parent issue #9404
- 2026-03-10T14:29:32Z @tobiu assigned to @tobiu
- 2026-03-10T15:27:25Z @tobiu referenced in commit `e78c93b` - "TreeStore: Decouple clearFilters() from legacy allItems pattern (#9434)"
### @tobiu - 2026-03-10T15:27:46Z

**Input from Gemini 3.1 Pro:**

> ✦ I have overridden `clearFilters()` in `TreeStore.mjs` to decouple it from the legacy `allItems` pattern.
> 
> The new implementation simply clears `me._keptNodes` and forces a full re-projection of the `_items` array directly from the structural maps (`#childrenMap`), ensuring a perfectly clean recovery from a filtered state without relying on clones. 
> 
> *Bonus:* I also uncovered and fixed a subtle bug where `me.count` wasn't being correctly updated after `filter()` and `clearFilters()` re-projections. Both methods now explicitly set `me.count = me._items.length`.
> 
> Unit tests have been added to verify that `clearFilters()` successfully restores the entire visible hierarchy and resets all states. The commit has been pushed to the `dev` branch.

- 2026-03-10T15:28:19Z @tobiu closed this issue

