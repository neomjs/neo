---
id: 8085
title: 'Refactor Store: Default to eager record init for DX and enhance JSDoc'
state: CLOSED
labels:
  - documentation
  - developer-experience
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T01:31:39Z'
updatedAt: '2025-12-11T01:51:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8085'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T01:51:21Z'
---
# Refactor Store: Default to eager record init for DX and enhance JSDoc

Refactor `Neo.data.Store` to default `add()` and `insert()` to eager record initialization (`init=true`) and enhance JSDoc.

**Reasoning (DX):**
The previous default behavior of `add()` returning raw data objects (lazy loading) was a common "gotcha" for developers, requiring a second step (`store.get(id)`) to obtain a usable `Model` instance.
By changing the default `init` parameter to `true`, `store.add(data)` now returns fully instantiated records by default, which is the expected behavior in most standard use cases.

**Changes:**
1.  **`Neo.data.Store`**:
    *   `add(item, init=true)`: Defaults to eager initialization.
    *   `insert(index, item, init=true)`: Defaults to eager initialization.
    *   Internal usages (`afterSetData`, `sort`) explicitly use `init=false` to preserve performance for bulk operations.
2.  **`examples/grid/bigData/MainStore.mjs`**:
    *   Explicitly uses `init=false` ("Turbo Mode") to ensure the 100k row benchmark continues to use the performant lazy-loading chunking mechanism.

**Documentation Enhancement:**
The JSDoc for `add` and `insert` in `Neo.data.Store` needs to be significantly enhanced to clearly explain:
*   The difference between `init=true` (eager, returns Records) and `init=false` (lazy, returns raw data / count).
*   The performance implications (use `init=false` for bulk loading).
*   The return type variations (`Number` vs `Array`).


## Timeline

- 2025-12-11T01:31:41Z @tobiu added the `documentation` label
- 2025-12-11T01:31:41Z @tobiu added the `developer-experience` label
- 2025-12-11T01:31:41Z @tobiu added the `ai` label
- 2025-12-11T01:31:41Z @tobiu added the `refactoring` label
- 2025-12-11T01:32:57Z @tobiu assigned to @tobiu
- 2025-12-11T01:51:14Z @tobiu referenced in commit `0abef4c` - "Refactor Store: Default to eager record init for DX and enhance JSDoc #8085"
- 2025-12-11T01:51:21Z @tobiu closed this issue

