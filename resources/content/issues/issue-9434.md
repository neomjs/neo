---
id: 9434
title: 'TreeStore: Decouple clearFilters() from legacy allItems pattern'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-10T14:26:41Z'
updatedAt: '2026-03-10T14:29:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9434'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

