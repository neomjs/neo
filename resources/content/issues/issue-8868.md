---
id: 8868
title: 'Fix: syncVnodeTree should nullify vnode for removed children'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-23T19:58:35Z'
updatedAt: '2026-01-23T22:50:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8868'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-23T22:50:37Z'
---
# Fix: syncVnodeTree should nullify vnode for removed children

**Description:**
The `syncVnodeTree` method in `src/mixin/VdomLifecycle.mjs` updates component state based on the new VNode structure returned by the VDom Worker. Currently, it iterates only over the *new* VNode's children. If a child component was removed (e.g. `removeDom: true`), it is skipped by `syncVnodeTree`, leaving the child with a stale `_vnode` reference and `mounted: true`.

**Goal:**
Ensure `component._vnode` is `null` and `mounted` is `false` when a component is removed from the DOM. This aligns the App Worker state with the actual DOM state.

**Proposed Change:**
1.  Modify `syncVnodeTree` to iterate **Logical Children** (`ComponentManager.find({parentId: me.id})`).
2.  If a logical child is not found in the new VNode (and is not floating), explicitly set `_vnode = null` and `mounted = false`.

**Verification:**
This change will likely break `test/playwright/unit/vdom/VdomLifecycle.spec.mjs`, specifically the test "vnode should PERSIST when component is hidden". This test should be updated to reflect the new, correct behavior (vnode should be null).

**Related Files:**
-   `src/mixin/VdomLifecycle.mjs`


## Timeline

- 2026-01-23T19:58:37Z @tobiu added the `bug` label
- 2026-01-23T19:58:37Z @tobiu added the `ai` label
- 2026-01-23T19:58:37Z @tobiu added the `core` label
### @tobiu - 2026-01-23T22:04:57Z

**Input from Gemini 3 Pro:**

> ✦ I attempted to implement the fix for this issue but encountered regressions that caused VDOM update cycles to time out in tests.
> 
> **Learnings & Analysis:**
> 
> 1.  **Logical Child Iteration:** Switching from `getChildren(vnode)` to `ComponentManager.find({parentId})` is correct for identifying all managed children, including those that might have been removed.
> 2.  **Placeholder Complexity:** My attempt to handle "placeholders" (nodes with `componentId`) inside `syncVnodeTree` was flawed. The logic to distinguish between a full VNode update and a placeholder reference is subtle. `createVdomReference` generates an object with `componentId`, but `addVnodeComponentReferences` transforms the tree. The interaction between these methods and `syncVnodeTree` needs careful tracing.
> 3.  **Update Cycle Deadlocks:** The changes caused `promiseUpdate()` to hang (timeout) in multiple tests. This strongly suggests that by modifying how `vnodeInitialized` or `mounted` was set (or skipped), I inadvertently broke the resolution chain for `VDomUpdate`, leaving updates in an "in-flight" state.
> 4.  **The "Silent" Update:** The `_vnode` update in `syncVnodeTree` is critical. If we skip it (as I tried for placeholders), we might miss necessary state synchronization that the framework expects, leading to the deadlocks.
> 
> **Recommendation for Next Attempt:**
> -   Focus strictly on the *missing* children case first.
> -   Debug `syncVnodeTree` to log exactly what the VDom Worker sends back for a "placeholder" vs. a "full" node.
> -   Ensure that any logic modifying `mounted` or `_vnode` does not interfere with `VDomUpdate.executeCallbacks`.

- 2026-01-23T22:49:49Z @tobiu referenced in commit `286640b` - "fix: syncVnodeTree should nullify vnode for removed children (#8868)"
### @tobiu - 2026-01-23T22:50:14Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for this issue.
> 
> **Changes:**
> 1.  Modified `src/mixin/VdomLifecycle.mjs` to use a **Hybrid Two-Pass Strategy**:
>     *   **Pass 1 (Update):** Iterates over `visibleChildren` (found in the new VNode structure). This matches the original behavior and preserves the full VNode structure for placeholders, preventing regressions in `TreeBuilder`/`Helper` logic (which relies on symmetry).
>     *   **Pass 2 (Unmount):** Iterates over ALL logical children (`ComponentManager.find`). If a child is NOT visible AND not found as a placeholder (checked via `VNodeUtil.find`), it is correctly unmounted (`_vnode = null`, `mounted = false`).
> 
> 2.  Added a regression test `test/playwright/unit/vdom/HiddenChildren.spec.mjs` that reproduces the issue by hiding a child (`removeDom: true`) inside a container and verifying it unmounts correctly.
> 
> **Verification:**
> *   `HiddenChildren.spec.mjs` passes (Child is unmounted).
> *   `RealWorldUpdates.spec.mjs` passes (No extra deltas/regressions).
> *   Full `npm run test-unit` passes (250 tests).
> 
> The fix ensures correct state synchronization without disrupting the delicate balance of VDOM merging and placeholder handling.

- 2026-01-23T22:50:23Z @tobiu assigned to @tobiu
- 2026-01-23T22:50:37Z @tobiu closed this issue
- 2026-01-23T23:21:17Z @tobiu cross-referenced by #8872
- 2026-01-23T23:30:53Z @tobiu cross-referenced by #8874

