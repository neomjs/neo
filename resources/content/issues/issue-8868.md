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
updatedAt: '2026-01-23T19:58:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8868'
author: tobiu
commentsCount: 0
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

