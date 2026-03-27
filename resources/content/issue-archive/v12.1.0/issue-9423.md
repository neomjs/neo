---
id: 9423
title: TreeStore Full CRUD Support & Structural Mutations
state: CLOSED
labels:
  - enhancement
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T18:41:11Z'
updatedAt: '2026-03-09T18:54:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9423'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T18:54:02Z'
---
# TreeStore Full CRUD Support & Structural Mutations

### Goal
To provide full CRUD operations (`remove`, `splice`, move) for the `Neo.data.TreeStore`, ensuring that the internal data maps (`#childrenMap`, `#allRecordsMap`) and the ARIA sibling stats remain perfectly synchronized with the visible flat array.

### Context
Currently, the `TreeStore` supports data ingestion (`add`) and visibility toggling (`expand`/`collapse`). However, invoking standard Collection mutation methods like `remove` or `splice` will only affect the visible `items` array, causing memory leaks and structural corruption in the internal Tree maps.

This is a critical prerequisite for advanced TreeGrid features like Drag & Drop reordering and moving child nodes between parents.

### Requirements

1.  **Override `splice`:** Implement a custom `splice` method in `TreeStore` that acts as the single source of truth for all mutations.
2.  **Removal Logic:** When a node is removed:
    - Recursively identify and remove all its descendants from `#allRecordsMap`.
    - Remove the node from its parent's array in `#childrenMap`.
    - If the node (or any descendants) was currently visible (expanded), calculate the flat delta and pass it to `super.splice()`.
3.  **Move Logic (Drag & Drop Prep):** Handle cases where an existing node is "added" again but with a different `parentId`.
    - Remove from the old parent's `#childrenMap`.
    - Add to the new parent's `#childrenMap`.
4.  **Recalculate ARIA Stats:** After any structural change to a parent's children array, invoke `updateSiblingStats(parentId)` on all affected parents to ensure `siblingCount` and `siblingIndex` remain accurate for O(1) rendering reads.


## Timeline

- 2026-03-09T18:41:11Z @tobiu assigned to @tobiu
- 2026-03-09T18:41:12Z @tobiu added the `enhancement` label
- 2026-03-09T18:41:13Z @tobiu added the `architecture` label
- 2026-03-09T18:41:13Z @tobiu added the `core` label
- 2026-03-09T18:41:22Z @tobiu added parent issue #9404
- 2026-03-09T18:53:21Z @tobiu referenced in commit `c5c4e40` - "feat(data): Implement TreeStore.splice for full CRUD support (#9423)"
### @tobiu - 2026-03-09T18:53:31Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the custom `TreeStore.splice()` method to act as the single source of truth for all structural mutations.
> 
> Key achievements:
> - **Removals:** Recursively cleans up deep descendants from `#allRecordsMap` and `#childrenMap`, preventing memory leaks and calculating the correct flat delta for the visible array.
> - **Additions/Moves:** Properly ingests new nodes or reparents moved nodes into the structural maps.
> - **ARIA Stats:** Recalculates `siblingCount` and `siblingIndex` for all parents affected by the mutation.
> - **Fallback Mutations:** Fires a manual `mutate` event even if the target nodes are hidden, ensuring secondary systems like `Store.count` remain in sync.
> 
> The `add()` override was removed entirely, as `Collection.add()` inherently funnels through this new, robust `splice()` method.
> 
> Closing as complete.

- 2026-03-09T18:54:02Z @tobiu closed this issue

