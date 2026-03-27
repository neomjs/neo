---
id: 9413
title: Create Async Subtree Loading for `Neo.data.TreeStore`
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T11:33:53Z'
updatedAt: '2026-03-09T14:31:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9413'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T14:31:13Z'
---
# Create Async Subtree Loading for `Neo.data.TreeStore`

### Goal
Enhance the `Neo.data.TreeStore` to support asynchronous loading of child nodes when a collapsed node is expanded, laying the groundwork for handling massive hierarchical datasets without a full `BufferedStore`.

### Architecture & Mechanics
We will leverage the existing `Store.load()` mechanics (specifically the `opts.append` pattern) and `Collection.splice()` to inject new data into the tree without destroying the current view. 

1. **Pre-condition Enforcement:**
   - If a node is loaded with `expanded: true` (or `collapsed: false`), the payload **must** contain its direct children. The `TreeStore` parsing logic should throw a warning if this condition is violated to prevent rendering empty folders.
2. **Count Separation:**
   - **`totalCount` (Data Perspective):** Represents the total size of the fully expanded tree on the backend (useful for metadata/pagination, but *not* for the scrollbar).
   - **`count` (UI Perspective):** Managed by the `Collection`. Represents the length of the flattened `_items` array (only the visible nodes). This drives the `GridBody` scrollbar height and `aria-rowcount`.
3. **The Async Expand Flow:**
   When `expand(nodeId)` is called on a node that does not have its children loaded in the `#childrenMap`:
   - Set the node's state to `isLoading: true` (triggers UI spinner).
   - Trigger a backend request for the subtree (e.g., `store.load({ params: { parentId: nodeId }, append: true })`).
   - Upon data arrival, parse the new subtree and update the internal `#childrenMap`.
   - Update the node's state: `isLoading: false`, `expanded: true`.
   - Execute a synchronous `splice` to inject the new child nodes into the flattened `items` array directly below the parent.
   - The resulting `mutate` event will automatically update the grid's rendering and scrollbar.

### Future-Proofing
By relying on `Collection.splice` and the flattened `_items` array, this implementation provides the exact hooks needed for a future `BufferedStore` (which would inject placeholder rows instead of actual data rows, triggering targeted fetches as they scroll into view).

### Dependencies
- Depends on the core `TreeStore` implementation (#9406).

## Timeline

- 2026-03-09T11:33:53Z @tobiu added the `enhancement` label
- 2026-03-09T11:33:54Z @tobiu added the `ai` label
- 2026-03-09T11:33:54Z @tobiu added the `core` label
- 2026-03-09T11:34:01Z @tobiu added parent issue #9404
- 2026-03-09T11:34:12Z @tobiu assigned to @tobiu
- 2026-03-09T14:30:04Z @tobiu referenced in commit `bf28e6c` - "feat: Add Async Subtree Loading to TreeStore (#9413)

- Added isLoading boolean to TreeModel.
- Upgraded TreeStore.expand() to an async method that fetches child nodes on demand via load({append: true}).
- Emits recordChange for isLoading state so the UI can render spinners.
- Refined TreeStore.add() to only process newly discovered roots, preventing duplicate processing and accidental appends when loading async child chunks."
### @tobiu - 2026-03-09T14:30:15Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented Async Subtree Loading for `Neo.data.TreeStore`.
> 
> - Added `isLoading: Boolean` to `Neo.data.TreeModel`.
> - Upgraded `TreeStore.expand()` to handle asynchronous requests via `load({append: true})` when expanding unloaded nodes.
> - Added state tracking (`isLoading = true`) and `recordChange` events to trigger UI spinners.
> - Hardened `TreeStore.add()` to ensure it only mathematically computes the visible flat list for truly *new* root nodes, gracefully swallowing asynchronously fetched child subtrees so `expand()` can splice them into the correct location without duplicating array append operations.
> 
> Changes pushed to `dev`.

- 2026-03-09T14:31:14Z @tobiu closed this issue
- 2026-03-09T14:46:55Z @tobiu cross-referenced by #9416

