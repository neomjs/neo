---
id: 8132
title: Refactor Component mount() and remove VdomLifecycle overhead
state: CLOSED
labels:
  - discussion
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-17T00:51:52Z'
updatedAt: '2025-12-17T01:10:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8132'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T01:10:16Z'
---
# Refactor Component mount() and remove VdomLifecycle overhead

This ticket proposes a refactoring of `Neo.component.Base#mount()` and the removal of the `hasUnmountedVdomChanges` mechanism in `Neo.mixin.VdomLifecycle`.

### Context & Problem
The current implementation of `mount()` contains legacy code that relies on `outerHTML`, which is not compatible with the default `DomApiRenderer`. Additionally, `Neo.mixin.VdomLifecycle` maintains a `hasUnmountedVdomChanges_` flag. This flag requires traversing the component's parent chain on **every single VDOM update** while a component is unmounted.

### Proposed Solution
1.  **Refactor `mount()`**: Simplify `Neo.component.Base#mount()` to be a direct alias for `this.initVnode(true)`.
2.  **Remove Overhead**: Delete the `hasUnmountedVdomChanges_` config, its `afterSet` hook, and its assignment logic in `updateVdom`.

### Trade-off Analysis (Pros & Cons)

**Pros (Why we are doing this):**
*   **Performance on Hot Path:** We eliminate the overhead of tracking `hasUnmountedVdomChanges` on every VDOM update. This logic traversed the parent chain unnecessarily, impacting performance for unmounted components (e.g., inactive tabs, hidden dialogs).
*   **Robustness:** By forcing `initVnode(true)`, we ensure the DOM is always mounted with the most up-to-date VDOM state, eliminating potential synchronization bugs.
*   **Cleanup:** Removes dead/legacy code related to string-based `outerHTML` mounting strategies.

**Cons (What we are sacrificing):**
*   **Loss of "Pre-render" Optimization:** In the specific edge case where a developer calls `await initVnode(false)` to pre-calculate the VNode tree, leaves the component **completely untouched**, and then calls `mount()`, the VNode tree will now be **regenerated** instead of re-used. This incurs a duplicate `TreeBuilder` run.

### Decision Rationale
The "Pre-render Optimization" scenario is an edge case (<1% likelihood) compared to the common scenario of components updating while unmounted (e.g., `hideMode: 'removeDom'`). The current architecture penalized the common case (tracking overhead) to support the rare case. Furthermore, the existing `mount()` optimization was already partially broken for `DomApiRenderer`.

We have decided that broadly improving runtime performance and codebase simplicity outweighs the loss of this specific edge-case optimization.

**Note:** If this optimization proves critical for specific advanced use cases (e.g., complex micro-frontends), it can be re-introduced in a more targeted manner in the future without imposing a global performance penalty.

### Tasks
1.  **`src/component/Base.mjs`**:
    *   Refactor `mount()` to `return this.initVnode(true);`.
    *   Remove legacy code/comments.
2.  **`src/mixin/VdomLifecycle.mjs`**:
    *   Remove `hasUnmountedVdomChanges_` from `static config`.
    *   Remove `afterSetHasUnmountedVdomChanges`.
    *   Remove logic setting `me.hasUnmountedVdomChanges` in `updateVdom`.

## Timeline

- 2025-12-17T00:51:53Z @tobiu added the `discussion` label
- 2025-12-17T00:51:53Z @tobiu added the `ai` label
- 2025-12-17T00:51:53Z @tobiu added the `refactoring` label
- 2025-12-17T00:51:53Z @tobiu added the `architecture` label
- 2025-12-17T00:52:53Z @tobiu assigned to @tobiu
- 2025-12-17T01:10:07Z @tobiu referenced in commit `02b25aa` - "Refactor Component mount() and remove VdomLifecycle overhead #8132"
- 2025-12-17T01:10:16Z @tobiu closed this issue

