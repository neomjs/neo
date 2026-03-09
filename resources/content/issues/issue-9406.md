---
id: 9406
title: Create `Neo.data.TreeStore`
state: OPEN
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T10:44:06Z'
updatedAt: '2026-03-09T11:10:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9406'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create `Neo.data.TreeStore`

### Goal
Create a specialized store to manage hierarchical data and provide a flattened view for virtual scrolling.

### Details
- **Location:** `src/data/TreeStore.mjs`
- **Extends:** `Neo.data.Store`
- **Internal State:**
  - Implement a `#childrenMap` (Map) keyed by `parentId` to enable O(1) child lookups.
- **Flattened View:**
  - The store must maintain the full data structure but expose a flattened 1D array of *only the visible nodes* (root nodes + children of expanded nodes) to the grid's virtual scroller.
- **Core Methods:**
  - `expand(nodeId)`: Updates node state, retrieves children, injects them into the flattened view, and fires a `mutate` event.
  - `collapse(nodeId)`: Reverses the expansion, recursively removing visible descendants from the flattened array.
  - `toggle(nodeId)`: Toggles the expanded state.
  - `loadData(data)`: Overridden to populate the internal `#childrenMap`.
- **Config:**
  - `singleExpand` (Boolean): Support for accordion-style expansion (expanding one node collapses siblings).

## Timeline

- 2026-03-09T10:44:07Z @tobiu added the `enhancement` label
- 2026-03-09T10:44:08Z @tobiu added the `ai` label
- 2026-03-09T10:44:08Z @tobiu added the `core` label
- 2026-03-09T10:44:23Z @tobiu added parent issue #9404
### @tobiu - 2026-03-09T11:09:10Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Guidance for Agents:**
> 
> The core architectural mandate for the `TreeStore` is to allow the `Neo.grid.Body` virtual scroller to function without modification.
> 
> 1. **The Flattened View:** The `GridBody` iterates over the store's `items` array. Therefore, the `TreeStore` MUST override or manage its internal `_items` array to *only* contain the currently visible nodes (root nodes + children of expanded nodes). 
> 2. **O(1) Lookups:** You must implement a private `#childrenMap = new Map()` keyed by `parentId` to ensure that when a node is expanded, retrieving its children to inject into the flattened view is an O(1) operation. Do not use `store.filter()` to find children during an expand operation.
> 3. **Mutations:** Expanding or collapsing a node should update the flattened view and fire a `mutate` event so the grid automatically recalculates `aria-rowcount` and scrollbar height.
> 
> **Important Files to Reference:**
> - `src/collection/Base.mjs` (Understand `splice` and `mutate` events).
> - `src/grid/Body.mjs` -> `createViewData()` (Understand how the grid maps the 1D array to the DOM).

- 2026-03-09T11:10:43Z @tobiu assigned to @tobiu

