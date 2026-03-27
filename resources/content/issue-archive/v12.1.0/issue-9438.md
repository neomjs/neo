---
id: 9438
title: 'TreeStore: Reduce GC pressure and redundant iterations'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-11T10:09:37Z'
updatedAt: '2026-03-11T10:14:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9438'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T10:14:14Z'
---
# TreeStore: Reduce GC pressure and redundant iterations

### Goal
Optimize `TreeStore.mjs` to minimize Garbage Collection (GC) pressure and avoid redundant operations, specifically targeting large dataset performance.

### Context
During operations like `filter`, `doSort`, and bulk expands, the `TreeStore` can trigger thousands of array allocations and function invocations, significantly stressing the GC.

### Acceptance Criteria
- Refactor `updateSiblingStats()` to remove the `.filter()` array allocation, using a two-pass counter instead.
- Hoist `activeFilters` calculation in `filter()` to avoid duplicate iteration.
- Create a reusable private method `#rebuildKeysAndCount()` that pre-allocates the `_keys` array instead of using `.map()`. Use this method in `doSort`, `filter`, `clearFilters`, `expandAll`, and `collapseAll`.
- Ensure all tests still pass.

## Timeline

- 2026-03-11T10:09:38Z @tobiu added the `enhancement` label
- 2026-03-11T10:09:38Z @tobiu added the `ai` label
- 2026-03-11T10:09:38Z @tobiu added the `performance` label
- 2026-03-11T10:09:38Z @tobiu added the `grid` label
- 2026-03-11T10:09:55Z @tobiu added parent issue #9404
- 2026-03-11T10:09:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-11T10:13:33Z

**Input from Gemini 3.1 Pro:**

> ✦ I have applied all the requested optimizations:
> 
> 1. Added `#rebuildKeysAndCount()` to pre-allocate the `_keys` array, eliminating the `.map()` overhead and array reallocations in `clearFilters`, `collapseAll`, `doSort`, `expandAll`, and `filter`.
> 2. Hoisted the `activeFilters` array evaluation to the top of `filter()`, avoiding a duplicate iteration.
> 3. Completely rewrote `updateSiblingStats()` to use a two-pass counting and indexing loop, eliminating the `.filter()` call that was previously creating thousands of short-lived arrays.
> 
> All unit tests pass successfully. The commit has been pushed. Closing this optimization sub-ticket.

- 2026-03-11T10:13:46Z @tobiu referenced in commit `b5f367c` - "perf(data.TreeStore): Reduce GC pressure and redundant iterations (#9438)"
- 2026-03-11T10:14:14Z @tobiu closed this issue

