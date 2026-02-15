---
id: 9165
title: '[Grid] Fix Runtime Buffer Updates Breaking Row/Cell Pooling'
state: OPEN
labels:
  - bug
  - ai
  - regression
  - architecture
assignees:
  - tobiu
createdAt: '2026-02-15T03:32:01Z'
updatedAt: '2026-02-15T03:47:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9165'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Grid] Fix Runtime Buffer Updates Breaking Row/Cell Pooling

Runtime changes to `bufferRowRange` and `bufferColumnRange` currently break the grid rendering (blank grid or missing cells).

**Root Cause:** The Row and Cell pooling logic (Epic #8964) initializes fixed pools based on the *initial* configuration.
1.  **Row Buffer:** Increasing `bufferRowRange` increases the required `items` count. The `createRowPool` logic needs to verify and expand the pool dynamically.
2.  **Column Buffer:** Changing `bufferColumnRange` recalculates `cellPoolSize`. Existing `Neo.grid.Row` instances rely on a fixed `pooledCells` array size initialized during their first render. They need to be forced to resize this pool to align with the new `cellPoolSize`.

**Proposed Fix:**
- Ensure `afterSetBufferRowRange` triggers pool expansion in `Neo.grid.Body`.
- Ensure `afterSetBufferColumnRange` triggers a full re-render of all rows to resize their cell pools.

## Timeline

- 2026-02-15T03:32:02Z @tobiu added the `bug` label
- 2026-02-15T03:32:02Z @tobiu added the `ai` label
- 2026-02-15T03:32:02Z @tobiu added the `regression` label
- 2026-02-15T03:32:02Z @tobiu added the `architecture` label
- 2026-02-15T03:47:55Z @tobiu assigned to @tobiu

