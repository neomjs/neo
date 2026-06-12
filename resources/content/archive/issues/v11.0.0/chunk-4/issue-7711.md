---
id: 7711
title: Fix VDOM Lifecycle and Update Collision Logic
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-11-06T13:46:59Z'
updatedAt: '2025-11-06T13:55:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7711'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-06T13:55:25Z'
---
# Fix VDOM Lifecycle and Update Collision Logic

This ticket covers three related fixes within `src/mixin/VdomLifecycle.mjs` to improve the robustness and correctness of the VDOM update lifecycle.

### 1. Corrected VDOM Update Collision Logic

The `hasUpdateCollision()` method was using `<=` to check for update conflicts. This was incorrect as `updateDepth` is 1-based. For example, an `updateDepth` of 2 should not conflict with a child at `distance` 2.

**Change:**
- In `hasUpdateCollision()`, the condition was changed from `distance <= updateDepth` back to `distance < updateDepth`.

### 2. Prevent Updates Before Vnode Initialization

A race condition could occur if an update request was processed before the component's `vnode` was fully initialized.

**Change:**
- In `updateVdom()`, an additional check `!me.vnodeInitialized` was added to the condition that queues needy updates. This ensures that updates are deferred until after the initial render is complete.

### 3. Ensure VDOM/Vnode Sync on Every Update

The `afterSetVnode()` hook only triggered `syncVnodeTree()` on the initial `vnode` assignment (`oldValue !== undefined`). This meant that on subsequent updates, if the VDOM worker generated new IDs for nodes, these changes were not synced back to the component's `vdom` blueprint.

**Change:**
- In `afterSetVnode()`, the condition was changed to `value`, ensuring `syncVnodeTree()` runs every time a new `vnode` is assigned, keeping the `vdom` and `vnode` trees consistent.

## Timeline

- 2025-11-06T13:47:00Z @tobiu added the `bug` label
- 2025-11-06T13:47:00Z @tobiu added the `ai` label
- 2025-11-06T13:55:05Z @tobiu referenced in commit `dc18d85` - "Fix VDOM Lifecycle and Update Collision Logic #7711"
- 2025-11-06T13:55:25Z @tobiu closed this issue

