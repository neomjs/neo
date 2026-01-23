---
id: 8868
title: 'Fix: syncVnodeTree should nullify vnode for removed children'
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-01-23T19:58:35Z'
updatedAt: '2026-01-23T22:04:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8868'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


