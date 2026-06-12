---
id: 9398
title: 'Performance: Eliminate O(N²) App Worker VDOM Traversal (syncVnodeTree)'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-03-08T19:57:19Z'
updatedAt: '2026-03-08T20:27:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9398'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T20:27:03Z'
---
# Performance: Eliminate O(N²) App Worker VDOM Traversal (syncVnodeTree)

**Problem:**
During a performance inspection of the App Worker while rapidly scrolling a Grid, it was discovered that `Neo.util.VNode.find()` is responsible for **~50% of the total App Worker CPU time** and **~37% of the self-time** (amounting to seconds of lock-up).

This is caused by an `O(N²)` performance trap inside `src/mixin/VdomLifecycle.mjs -> syncVnodeTree()`.
Currently, the method iterates over all `childComponents` (which can be hundreds of nodes in a grid) and calls `VNodeUtil.find(me.vnode, component.vdom.id)` for each one. This results in a full recursive tree traversal per child component on every update cycle.

Furthermore, during the unmount check, `Array.includes()` is used inside a loop against the same massive `childComponents` array, creating a secondary bottleneck.

**Proposed Solution:**
Instead of repeatedly traversing the tree, we should do a single pass to create a flat map of the VNode structure, achieving `O(1)` lookups.

1. **New Utility:** Implement `Neo.util.VNode.createMap(vnode)` (inspired by `Neo.vdom.Helper.createVnodeMap`).
2. **Refactor:** Update `syncVnodeTree` to generate this map once at the start of the method and use it for `O(1)` node resolution.
3. **Optimize Array Lookup:** Convert `childComponents` to a `Set` or use a different strategy to eliminate the `O(N²)` overhead of `!childComponents.includes(component)`.

**Testing & Verification Strategy:**
To measure the impact, we will create a new Playwright unit test (`test/playwright/unit/app/devindex/GridScrollProfile.spec.mjs`) that utilizes the DevIndex `GridContainer` and the 50k users dataset. By simulating a vertical scroll (triggering a massive VDOM delta on the child components) and measuring the execution time before and after the refactoring, we can explicitly quantify the performance gain.

## Timeline

- 2026-03-08T19:57:21Z @tobiu added the `enhancement` label
- 2026-03-08T19:57:21Z @tobiu added the `ai` label
- 2026-03-08T19:57:21Z @tobiu added the `architecture` label
- 2026-03-08T19:57:21Z @tobiu added the `performance` label
- 2026-03-08T20:26:10Z @tobiu referenced in commit `9fcf3f9` - "perf: Eliminate O(N²) App Worker VDOM Traversal in syncVnodeTree (#9398)"
- 2026-03-08T20:26:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T20:26:37Z

**Input from Gemini 3.1 Pro:**

> ✦ **Task Completed:**
> 
> - Implemented `Neo.util.VNode.createMap` to recursively generate a flat Map of the VNode tree.
> - Refactored `src/mixin/VdomLifecycle.mjs -> syncVnodeTree()` to use this new map and `Set` lookups.
> - Created `test/playwright/unit/app/devindex/GridScrollProfile.spec.mjs` to establish an empirical benchmark using the 50k dataset and ~40 rows with 30 columns.
> - Measured a drop in synchronous `syncVnodeTree` overhead during scrolling deltas from **~167ms** down to **~45ms** (~73% improvement).
> 
> The N² trap has been bypassed, freeing up massive App Worker CPU cycles during rapid grid scrolling.

- 2026-03-08T20:27:03Z @tobiu closed this issue
- 2026-03-08T20:41:40Z @tobiu cross-referenced by #9399
- 2026-03-08T20:58:02Z @tobiu referenced in commit `4b0908d` - "fix: Ensure VNodeUtil.createMap mimics VNodeUtil.find strictly (#9398)"

