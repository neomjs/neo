---
id: 9411
title: TreeGrid Unit Tests (Data & Logic)
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:03:42Z'
updatedAt: '2026-03-10T13:02:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9411'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-10T13:02:41Z'
---
# TreeGrid Unit Tests (Data & Logic)

### Goal
Ensure the core logic of the `TreeStore` and `TreeModel` is robust and handles hierarchical data operations deterministically using the Playwright unit testing environment.

### Details
1.  **Data Operations:**
    - Test `TreeStore` flattening logic: Ensure that expanding/collapsing nodes correctly updates the visible array of records.
    - Test the `#childrenMap` caching: Verify that O(1) lookups return correct child nodes.
    - Test `singleExpand` mode logic.
2.  **Soft Hydration:**
    - Verify that `depth`, `isLeaf`, `siblingCount`, and `siblingIndex` are correctly resolved for raw data objects when `autoInitRecords: false` is used (Turbo Mode).
3.  **Environment:**
    - Create tests in `test/playwright/unit/data/TreeStore.spec.mjs`.

## Timeline

- 2026-03-09T11:03:42Z @tobiu added the `enhancement` label
- 2026-03-09T11:03:43Z @tobiu added the `ai` label
- 2026-03-09T11:03:43Z @tobiu added the `testing` label
- 2026-03-09T11:03:43Z @tobiu added the `grid` label
- 2026-03-09T11:03:54Z @tobiu added parent issue #9404
- 2026-03-09T11:11:08Z @tobiu assigned to @tobiu
- 2026-03-10T12:34:26Z @tobiu referenced in commit `0db923e` - "test(data): Add initial TreeStore Splice mechanics unit test (#9411)"
### @tobiu - 2026-03-10T12:35:14Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed the initial test file `test/playwright/unit/data/TreeStore.spec.mjs` which perfectly reproduces the structural mutation bugs we are seeing in the `TreeGrid`.
> 
> Here are some hints and specific bugs that need to be explored in the next session based on our latest findings:
> 
> 1. **Initial Ingestion Bug:** During Store initialization, the projection algorithm is dropping nodes. With the `MainStore` test data, only 6 nodes are rendered initially instead of 7 (`child-1-2-2` / `Row.mjs` is completely missing from `store.items`).
> 2. **`collectVisibleDescendants` Logic:** When collapsing a deeply nested folder (like `component`), the `visibleDescendants` array incorrectly gathers root-level siblings (like `package.json` and `README.md`) and slices them out of the grid. This suggests the structural maps or the tree traversal loop has a scoping bug.
> 3. **Row Pool Sizing Bug (`grid.Body`):** In the demo, the grid initializes 53 row components for only 7 nodes. This completely breaks the `itemIndex = i % poolSize` recycling math, causing the "7-click delay" for UI updates because `updateContent` hits an early-exit condition on the exact same row/record reference. 
> 4. **VDOM invalidation:** Once the `TreeStore.splice` and row pooling math are fixed, we still need to ensure that `grid.Row#updateContent` properly invalidates and re-renders if a `Record` mutates internally, even if `force: false` is passed. Adding a `lastRecordVersion` check to `updateContent` is likely the fix here.

- 2026-03-10T13:01:05Z @tobiu referenced in commit `38fb71a` - "feat(data): TreeStore Soft Hydration & Splice fixes (#9411)"
### @tobiu - 2026-03-10T13:01:42Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the fixes and tests for the `TreeStore` data and logic mechanics.
> 
> **Key Findings & Fixes:**
> 1. **The "Missing Siblings" Bug:** When expanding or collapsing nodes, siblings (like `grid` when expanding `component`, or `README.md` when collapsing `component`) were disappearing.
>    - **Root Cause:** I traced this down to a critical bug in `Store.hydrateRecord`. When `TreeStore.get(key)` was called for a hidden node (not in the visible `_items` array), it fetched the raw object from `#allRecordsMap` and correctly called `hydrateRecord`. However, `hydrateRecord` was unconditionally calling `me.map.set(pk, record)`. This leaked hidden nodes into the active `Collection.map`.
>    - **Impact:** When `TreeStore.splice` generated the `visibleToAdd` array and passed it to `Collection.splice`, `Collection.splice` skipped adding those nodes because `!map.has(key)` evaluated to `false` (since the hidden node had already bled into the map). This resulted in an empty `addedItems` array, silently failing the operation and corrupting the visible list.
>    - **Fix:** I updated `Store.hydrateRecord` to only replace an item in `me.map` if it *already exists* in the map (`if (me.map.has(pk))`). This prevents hidden/filtered items from bleeding into the active collection state during "Soft Hydration".
> 
> 2. **Turbo Mode / Soft Hydration (`autoInitRecords: false`):**
>    - In Turbo Mode, the `grid.Row` expects properties like `depth`, `isLeaf`, `collapsed`, `siblingCount`, and `siblingIndex` to be available directly on the raw data objects.
>    - I updated `TreeStore.splice` to actively perform **Soft Hydration** during ingestion. If raw data objects are missing `depth`, `isLeaf`, or `collapsed`, it computes and injects them directly (e.g. `depth = parent.depth + 1`).
>    - `siblingCount` and `siblingIndex` were already being handled correctly via `updateSiblingStats()`, which mutates the raw objects.
> 
> **Unit Tests Added:**
> I expanded `test/playwright/unit/data/TreeStore.spec.mjs` to comprehensively cover these scenarios:
> 1. `should only remove visible descendants on collapse, not siblings`: Verifies the fix for the `Store.hydrateRecord` map bleed bug.
> 2. `singleExpand mode should collapse siblings when a node is expanded`: Verifies the correct interaction of `singleExpand` when sibling nodes are toggled.
> 3. `#childrenMap and #allRecordsMap caching logic`: Verifies O(1) accessibility for both visible and hidden nodes.
> 4. `siblingCount and siblingIndex are correctly resolved for raw data objects`: Verifies the Turbo Mode (Soft Hydration) logic successfully computes and assigns all hierarchical metadata (`depth`, `isLeaf`, `collapsed`, `siblingCount`, `siblingIndex`) to raw JSON objects without instantiating full Records.
> 
> All 4 tests are passing! I have committed the changes and will close this issue now.

- 2026-03-10T13:02:42Z @tobiu closed this issue

