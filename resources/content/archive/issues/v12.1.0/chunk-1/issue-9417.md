---
id: 9417
title: Optimize `TreeStore` Hot Paths (Performance)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:00:01Z'
updatedAt: '2026-03-09T15:11:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9417'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T15:08:09Z'
---
# Optimize `TreeStore` Hot Paths (Performance)

### Goal
Maximize the performance of recursive and iteration-heavy operations inside `Neo.data.TreeStore` by replacing high-overhead functional iterators (`Array.prototype.forEach`) with optimized `for` loops.

### Context
Tree structures naturally require recursive algorithms to collect descendants (e.g., `collectVisibleDescendants`). When a user expands a node with thousands of descendants, the overhead of creating a new function execution context for every single `forEach` callback becomes a measurable bottleneck. While this cannot cause UI stutters (due to the multi-threaded architecture keeping the Main thread free), it can cause a noticeable delay before the VDOM diff is generated and dispatched to the UI.

### Acceptance Criteria
- Refactor `add()`: Replace `forEach` on `items` and `newRoots` with `for` loops.
- Refactor `collectVisibleDescendants()`: Replace `forEach` on `children` with a `for` loop. This is the most critical recursive hot path.
- Refactor `expand()` and `collapse()`: Replace `forEach` on `children` and `siblings` with `for` loops.

### Dependencies
- Depends on the core `TreeStore` implementation.

## Timeline

- 2026-03-09T15:00:03Z @tobiu added the `enhancement` label
- 2026-03-09T15:00:03Z @tobiu added the `ai` label
- 2026-03-09T15:00:03Z @tobiu added the `performance` label
- 2026-03-09T15:00:03Z @tobiu added the `core` label
- 2026-03-09T15:00:11Z @tobiu added parent issue #9404
- 2026-03-09T15:02:32Z @tobiu assigned to @tobiu
- 2026-03-09T15:07:35Z @tobiu referenced in commit `b04627c` - "perf: Optimize TreeStore recursive hot paths (#9417)

- Replaced multiple `Array.prototype.forEach` usages with highly optimized `for` loops.
- This significantly reduces function execution context overhead during recursive tree traversals (e.g., `collectVisibleDescendants`, `collapse`, `expand`), which is critical for maintaining 60fps when managing massive subtrees inside the App Worker."
### @tobiu - 2026-03-09T15:07:43Z

**Input from Gemini 3.1 Pro:**

> ✦ Replaced all `Array.prototype.forEach` iterator calls with optimized standard `for` loops inside `TreeStore.mjs`.
> 
> This eliminates function creation and execution context overhead during recursive tree traversals (`collectVisibleDescendants`), ensuring O(1) mathematical injection algorithms remain hyper-fast even when expanding folders with thousands of descendants.
> 
> Changes pushed to `dev`.

- 2026-03-09T15:08:10Z @tobiu closed this issue

