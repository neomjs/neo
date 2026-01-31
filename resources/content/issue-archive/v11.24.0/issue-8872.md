---
id: 8872
title: 'Perf: Implement Reverse Component Map in ComponentManager'
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-23T23:21:16Z'
updatedAt: '2026-01-24T13:54:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8872'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-24T13:54:20Z'
---
# Perf: Implement Reverse Component Map in ComponentManager

**Description:**
The fix for #8868 (unmounting missing children in `syncVnodeTree`) introduced a potential performance bottleneck. `syncVnodeTree` now calls `ComponentManager.find({parentId: me.id})` on every VDOM update. Since `find` iterates all components (O(N)), this scales poorly with the number of components.

**Goal:**
Optimize child lookup to O(1) by maintaining a Reverse Map in `Neo.manager.Component`.

**Proposed Implementation:**
1.  Add `childMap` (e.g., `Map<String, Set<String>>`) to `Neo.manager.Component`.
2.  Hook into `register` to add the component to its parent's set.
3.  Hook into `unregister` to remove the component from its parent's set.
4.  Hook into `afterSetParentId` (via `onConfigChange` or similar, or override `Component` logic) to move the component between sets.
    *   Since `parentId` is a reactive config on `Neo.component.Base`, we can leverage this.
5.  Expose a method `getDirectChildren(parentId)` that returns the Set (or Array).
6.  Update `VdomLifecycle.syncVnodeTree` to use this optimized method.

**Note:**
This optimization is critical for maintaining high performance in large applications.

## Timeline

- 2026-01-23T23:21:17Z @tobiu added the `ai` label
- 2026-01-23T23:21:17Z @tobiu added the `performance` label
- 2026-01-23T23:21:17Z @tobiu added the `core` label
- 2026-01-24T13:52:59Z @tobiu referenced in commit `d1a6b88` - "perf: Implement Reverse Component Map in ComponentManager (#8872)"
- 2026-01-24T13:53:15Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-24T13:53:44Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Reverse Component Map optimization to address the performance bottleneck in `syncVnodeTree`.
> 
> **Changes:**
> 1.  **`Neo.manager.Component`**:
>     *   Added `childMap` (Map<String, Set<String>>) to track parent-child relationships.
>     *   Added `getDirectChildren(parentId)` method for O(1) lookup.
>     *   Enhanced `register`, `unregister`, and added `onParentIdChange` to maintain the map.
>     *   Optimized `unregister` with safe destructuring and intent-driven JSDoc.
> 
> 2.  **`Neo.component.Abstract`**:
>     *   Implemented `afterSetParentId` to notify `ComponentManager` of changes.
> 
> 3.  **`Neo.mixin.VdomLifecycle`**:
>     *   Updated `syncVnodeTree` to use `ComponentManager.getDirectChildren(me.id)` instead of the O(N) `find()` method.
> 
> 4.  **Tests**:
>     *   Added `test/playwright/unit/vdom/ParentIdChange.spec.mjs` to verify `childMap` integrity during lifecycle events (create, move, destroy).
>     *   Verified against `test/playwright/unit/vdom/HiddenChildren.spec.mjs` to ensure no regressions in the original bug fix (#8868).
> 
> The optimization reduces child lookup complexity from O(N) to O(1), ensuring scalability for large component trees.

- 2026-01-24T13:54:20Z @tobiu closed this issue

