---
id: 9474
title: 'Grid: Optimize row pooling for small datasets'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-14T12:07:15Z'
updatedAt: '2026-03-14T12:08:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9474'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T12:08:56Z'
---
# Grid: Optimize row pooling for small datasets

The Grid's `Body` component previously calculated its row pool size strictly based on the visible viewport height plus the `bufferRowRange` (`availableRows + 2 * bufferRowRange`). 

For small datasets (e.g., 9 records) displayed in a large viewport (e.g., capable of fitting 30+ rows), this caused the grid to unnecessarily instantiate and manage a large number of empty `Neo.grid.Row` components that would never receive data.

This optimization clamps the maximum pool size to the total number of records in the store (`store.count`), significantly reducing the initial VDOM generation and memory footprint for small grids while maintaining O(1) recycling performance for large datasets.

**Changes:**
- Introduced a `rowPoolSize` class field in `src/grid/Body.mjs`.
- Clamped the row pool generation to `Math.min(windowSize, store.count)`.
- Updated all internal ID generation (`getRowId`) to respect the dynamic pool size.
- Migrated all deprecated `store.getCount()` calls to `store.count` within `Body.mjs`.

## Timeline

- 2026-03-14T12:07:15Z @tobiu added the `enhancement` label
- 2026-03-14T12:07:15Z @tobiu added the `ai` label
- 2026-03-14T12:07:16Z @tobiu added the `performance` label
- 2026-03-14T12:07:16Z @tobiu added the `grid` label
- 2026-03-14T12:08:01Z @tobiu assigned to @tobiu
- 2026-03-14T12:08:18Z @tobiu referenced in commit `b0cca03` - "feat(grid): Optimize row pooling for small datasets (#9474)"
### @tobiu - 2026-03-14T12:08:35Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully implemented the grid row pooling optimization:
> - Added the `rowPoolSize` class field in `src/grid/Body.mjs` instead of hijacking internal properties.
> - Updated `createRowPool()` to compute the needed size via `Math.min(windowSize, store.count)`.
> - Replaced all deprecated `store.getCount()` occurrences with `store.count`.
> - Ensured `getRowId()` relies on the dynamic `rowPoolSize` for `rowIndex % poolSize` modulus calculation.
> 
> This effectively minimizes the initial VDOM generation for smaller grids without impacting performance on massive ones.

- 2026-03-14T12:08:56Z @tobiu closed this issue
- 2026-03-14T12:34:16Z @tobiu cross-referenced by #9475

