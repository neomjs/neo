---
id: 9428
title: 'TreeStore: Implement hierarchical sorting for doSort override'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-10T13:15:48Z'
updatedAt: '2026-03-10T13:58:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9428'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T13:58:27Z'
---
# TreeStore: Implement hierarchical sorting for doSort override

### Goal
Implement a custom `doSort()` override in `Neo.data.TreeStore` that sorts sibling nodes while preserving the parent-child tree hierarchy.

### Context
`TreeStore` currently inherits `doSort()` from `Collection.Base`, which simply sorts the flat `_items` array globally. If you apply a sorter (e.g., alphabetical by name), it will mix parents and children, completely destroying the visual tree structure.

### Acceptance Criteria
- Override `doSort()` in `TreeStore`.
- The sorting algorithm must iterate through `#childrenMap` and sort each parent's array of children individually.
- After structurally sorting the tree, it must perform a top-down recursive projection to completely recalculate the flattened `_items` array, ensuring parents always immediately precede their children in the flat view.
- Ensure "Turbo Mode" (lazy instantiation) remains supported during this process.
- Add a test case verifying the hierarchical sort order.

## Timeline

- 2026-03-10T13:15:50Z @tobiu added the `enhancement` label
- 2026-03-10T13:15:50Z @tobiu added the `ai` label
- 2026-03-10T13:15:50Z @tobiu added the `architecture` label
- 2026-03-10T13:15:51Z @tobiu added the `grid` label
- 2026-03-10T13:16:02Z @tobiu added parent issue #9404
### @tobiu - 2026-03-10T13:36:53Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Guidance for Future Sessions:**
> 
> We have established a robust Playwright unit testing environment for the data layer in `test/playwright/unit/data/TreeStore.spec.mjs`. 
> 
> When implementing the hierarchical `doSort` override, please add a new `test.describe` block to this file. 
> 
> **Testing Requirements:**
> 1. Initialize a `TreeStore` with a known nested hierarchy.
> 2. Apply a Sorter (e.g., descending alphabetically by name).
> 3. Assert that the resulting flat `_items` array correctly orders siblings *while strictly maintaining the parent -> child contiguous sequences*. Parents must not be mixed globally with children.
> 4. Ensure the test covers both **Turbo Mode** (`autoInitRecords: false` using raw objects) and standard mode (Records).

- 2026-03-10T13:54:01Z @tobiu referenced in commit `5eaf2d6` - "feat: TreeStore hierarchical sorting override (#9428)"
- 2026-03-10T13:57:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-10T13:58:02Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the hierarchical sorting logic for the `TreeStore` data layer:
> 
> 1. **Turbo Mode support**: `TreeStore` correctly soft-hydrates the entire `allRecordsMap` before sorting, ensuring the complex fields (like resolving 'name' from references if needed) are evaluated on raw nodes without instantiating them into `Neo.data.Record` objects unless strictly necessary.
> 2. **Hierarchical Sorting**: Adapted the versatile `sortArray` logic from `Neo.collection.Base` to act locally on each array inside `TreeStore.#childrenMap`. This correctly sorts all siblings under a shared parent.
> 3. **Flat Tree Projection Re-calculation**: After mapping the internal hierarchies, it utilizes `collectVisibleDescendants` starting from the `root` elements to generate a new correctly ordered contiguous `_items` array for the `GridBody` virtual scroller. 
> 4. **Tested in Playwright**: 2 test cases were added to `test/playwright/unit/data/TreeStore.spec.mjs`, covering deep hierarchical sorting for both ASC and DESC orders, and enforcing that the hierarchy handles `Turbo Mode` seamlessly.
> 
> Closing the ticket!

- 2026-03-10T13:58:27Z @tobiu closed this issue

