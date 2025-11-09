---
id: 7184
title: 'Grid: Optimize Rendering for Chunked Data Loading'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T22:39:06Z'
updatedAt: '2025-08-11T22:44:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7184'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-11T22:44:33Z'
---
# Grid: Optimize Rendering for Chunked Data Loading

**Reported by:** @tobiu on 2025-08-11

### Is your feature request related to a problem? Please describe.
When dealing with very large datasets in grids, loading all data at once can lead to significant performance issues and a poor user experience due to long initial rendering times.

### Describe the solution you'd like
Implement an optimized rendering mechanism for grids that supports chunked data loading from stores. This involves:
1.  **`src/data/Store.mjs`**: Enhance the `load` event to include a `postChunkLoad` flag, indicating when a load operation is part of a larger chunked data transfer.
2.  **`src/grid/Body.mjs`**: 
    *   Introduce internal flags (`#initialChunkSize`, `#initialTotalSize`) to manage the state of chunked loading.
    *   Modify the `createViewData` method to initially render only the first data chunk received, rather than attempting to render the entire (potentially very large) dataset at once.
    *   Adjust `getRowId` and `updateScrollHeight` to correctly account for the initial chunked rendering.
    *   Conditionally execute post-load operations (like scrolling) only after the full data set is loaded, not after each chunk.

This optimization will allow grids to display data much faster when dealing with large datasets that are loaded incrementally, providing a smoother and more responsive user experience.

### Describe alternatives you've considered
(No specific alternatives considered as this is an optimization of an existing process for chunked data.)

### Additional context
This feature is based on the changes introduced in commit `e76ed9180e32027c157a5615305a824ef820de91`.

