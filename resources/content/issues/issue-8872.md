---
id: 8872
title: 'Perf: Implement Reverse Component Map in ComponentManager'
state: OPEN
labels:
  - ai
  - performance
  - core
assignees: []
createdAt: '2026-01-23T23:21:16Z'
updatedAt: '2026-01-23T23:21:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8872'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

