---
id: 9467
title: Fix TreeStore.collapse() failing after expandAll() due to out-of-sync Collection map
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-13T13:05:25Z'
updatedAt: '2026-03-13T13:06:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9467'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T13:06:40Z'
---
# Fix TreeStore.collapse() failing after expandAll() due to out-of-sync Collection map

### Bug Description
When `collapse()` is called on a `TreeStore` node immediately after `expandAll()`, the node's descendants are not removed from the visible projection array, leaving the UI out of sync with the data state.

### Root Cause
`TreeStore` uses `#rebuildKeysAndCount()` to quickly rebuild its visible projection (`_items`) after bulk operations like `expandAll` or `filter`. However, this method neglected to rebuild the `Collection`'s internal `map` alongside the `_items` and `_keys` arrays. 

When `collapse(node)` is subsequently called, it relies on `me.indexOf(node)` to find the start index for the removal splice. Because the `map` is out of sync, `indexOf` returns `-1`, and the `super.splice()` operation is bypassed entirely.

### Solution
- Updated `TreeStore.#rebuildKeysAndCount()` to correctly clear and populate `me.map`.
- Added a dedicated unit test `test/playwright/unit/data/TreeStoreCollapseBug.spec.mjs` to prevent regressions.
- Updated the E2E tests in `GridTreeBigData.spec.mjs` to use `{ force: true }` on clicks to ensure stable execution within the ControlsContainer overflow area.

## Timeline

- 2026-03-13T13:05:26Z @tobiu added the `bug` label
- 2026-03-13T13:05:26Z @tobiu added the `ai` label
- 2026-03-13T13:05:26Z @tobiu added the `testing` label
- 2026-03-13T13:06:09Z @tobiu referenced in commit `cad7c5b` - "fix(TreeStore): Rebuild Collection map during bulk operations (#9467)

- Updated TreeStore.#rebuildKeysAndCount() to reconstruct the Collection.map
- Added unit test to verify collapse() works correctly after expandAll()
- Ensured E2E test clicks are forced when targeting overflow controls"
- 2026-03-13T13:06:21Z @tobiu assigned to @tobiu
- 2026-03-13T13:06:40Z @tobiu closed this issue

