---
id: 8123
title: Fix VDOM initialization race condition causing child update collisions
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-16T17:03:00Z'
updatedAt: '2025-12-16T17:06:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8123'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T17:06:00Z'
---
# Fix VDOM initialization race condition causing child update collisions

A race condition exists in `src/mixin/VdomLifecycle.mjs` where child components can trigger VDOM updates concurrently with their parent's initialization phase (`initVnode`).

**The Issue:**
1.  `initVnode` sets `me.isVdomUpdating = true` but fails to register the update with the global `VDomUpdate` manager.
2.  Consequently, the hierarchical safeguard `isParentUpdating` fails for child components because `VDomUpdate.getInFlightUpdateDepth(parent.id)` returns `undefined`.
3.  Additionally, `me.isVdomUpdating` is set to `false` prematurely in `initVnode`, before the component is mounted and the update promise is resolved.

**Symptoms:**
-   Child components triggering updates (e.g., via `vnodeInitialized` hooks) collide with the parent's ongoing initialization.
-   This can lead to state desynchronization with the VDOM worker, resulting in duplicate DOM insertions (as seen in `Panel` components duplicating headers/bodies).

**Proposed Fix:**
1.  **Register In-Flight Update:** `initVnode` must call `VDomUpdate.registerInFlightUpdate(me.id, -1)` to formally lock the tree.
2.  **Centralize Cleanup:** Move `me.isVdomUpdating = false` into `resolveVdomUpdate` to ensure the flag remains true until the entire transaction (including callbacks and mounting) is complete.
3.  **Refactor:** Update `executeVdomUpdate` to rely on `resolveVdomUpdate` for clearing the flag, ensuring consistency.

## Timeline

- 2025-12-16T17:03:02Z @tobiu added the `bug` label
- 2025-12-16T17:03:02Z @tobiu added the `ai` label
- 2025-12-16T17:03:26Z @tobiu assigned to @tobiu
- 2025-12-16T17:05:43Z @tobiu referenced in commit `f00d8f9` - "Fix VDOM initialization race condition causing child update collisions (#8123)

The intermittent content duplication in Panel components was traced to a race condition where child components triggered VDOM updates concurrently with their parent's initialization phase. This occurred because  set  locally but failed to register with the  manager, causing hierarchical safeguards () to fail.

This commit refactors the VDOM lifecycle to ensure strict synchronization:
1.  **Register:**  now calls  to formally lock the component tree during initialization.
2.  **Centralize Cleanup:** The  logic has been moved into . This ensures that the "busy" state persists until the entire update transaction (including mounting and callbacks) is fully resolved, preventing premature child updates.
3.  **Consistency:**  and  now share the same resolution path, eliminating redundancy and potential for drift."
- 2025-12-16T17:06:00Z @tobiu closed this issue

