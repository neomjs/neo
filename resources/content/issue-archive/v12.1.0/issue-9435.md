---
id: 9435
title: 'TreeStore: Fix visible projection for dynamic child additions to expanded parents'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-10T21:17:17Z'
updatedAt: '2026-03-10T22:14:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9435'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T22:14:04Z'
---
# TreeStore: Fix visible projection for dynamic child additions to expanded parents

When a new child node is dynamically added to a `TreeStore` and its parent is already expanded, the `splice()` method fails to correctly project this new child into the flat `_items` array at the correct hierarchical index. 

Currently, the logic either misses the child entirely (if the parent is already in `#allRecordsMap`) or relies on `Collection.splice` without an index, which appends the node to the very end of the array, destroying the visual tree structure.

We need to calculate the precise insertion index for `visibleToAdd` nodes, or restructure the insertion logic to ensure they appear sequentially after their parent and preceding siblings in the flat view.

## Timeline

- 2026-03-10T21:17:17Z @tobiu assigned to @tobiu
- 2026-03-10T21:17:19Z @tobiu added the `bug` label
- 2026-03-10T21:17:19Z @tobiu added the `ai` label
- 2026-03-10T21:17:56Z @tobiu added parent issue #9404
- 2026-03-10T22:13:11Z @tobiu referenced in commit `4d16914` - "fix(data.TreeStore): Fix visible projection for dynamic child additions to expanded, sorted, and filtered trees (#9435)

- Implemented getInsertIndexForNode to correctly calculate the hierarchical flat array insertion index for dynamic additions when no sorters or filters are present.
- Fixed a major symbol mismatch between Collection.Base and TreeStore (using Symbol.for globally) that prevented TreeStore from detecting when it was filtered.
- Updated TreeStore.splice() to gracefully trigger a full projection rebuild (me.filter()) if an item is added while ancestor-aware filters are active.
- Added comprehensive unit tests for inserting nodes into sorted and filtered TreeStores."
### @tobiu - 2026-03-10T22:13:38Z

**Input from Gemini 3.1 Pro:**

> ✦ The code has been successfully committed and pushed! 
> 
> The underlying issue wasn't just the logic for calculating the insertion index, but also a major symbol mismatch between `Collection.Base` and `TreeStore` that caused `TreeStore.splice()` to fail to detect when filters were active. 
> 
> **Summary of Fixes:**
> 1. **Unfiltered/Unsorted Additions:** Implemented `getInsertIndexForNode` to accurately calculate the flat projection index based on the preceding sibling's deep visible descendants, ensuring nodes are inserted perfectly after their parent in the `_items` array.
> 2. **Filtered Additions:** Standardized all state symbols (`isFiltered`, `isSorted`, `updatingIndex`) to use `Symbol.for()` globally across `Collection.Base` and `TreeStore.mjs`. `TreeStore.splice()` now correctly intercepts dynamic additions during filtered states and triggers a clean `me.filter()` projection rebuild without corrupting the O(1) maps.
> 3. **Sorted Additions:** Confirmed via new unit tests that the existing `autoSort` mechanic cleanly relies on `TreeStore.doSort()` to handle positional insertion for sorted tree stores.
> 
> I will close this ticket now.

- 2026-03-10T22:14:04Z @tobiu closed this issue
- 2026-03-10T22:20:07Z @tobiu referenced in commit `3f315d6` - "docs(data.TreeStore): Enhance JSDoc for getInsertIndexForNode (#9435)"

