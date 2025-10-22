---
id: 7086
title: Enhance Functional Component VDOM Reconciliation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-21T00:33:23Z'
updatedAt: '2025-07-21T09:49:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7086'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-21T09:49:53Z'
---
# Enhance Functional Component VDOM Reconciliation

**Reported by:** @tobiu on 2025-07-21

**Problem**: Functional components recreate their VDOM from scratch on every render. This discards any worker-generated IDs that were synced back to the component's `vdom` object. When a subsequent update occurs, the VDOM worker receives a keyless VDOM tree, which it must compare against the old, keyed `vnode` tree. This leads to inefficient diffing, causing the VDOM engine to generate excessive `removeNode` and `insertNode` deltas instead of minimal, targeted updates. This forces developers to manually add stable `ids` to all conditional child nodes as a workaround.

**Solution**: Inside src/functional/component/Base.mjs, modify the onEffectRunStateChange() method. Just before `updateVdom()` is called, add a call to `me.syncVdomIds()`.

This will "re-hydrate" the newly created, keyless VDOM with the stable IDs from the previously rendered vnode tree. This ensures that the VDOM worker always receives a fully-keyed VDOM, allowing it to perform a hyper-efficient diff and generate minimal, correct deltas.

Benefits:
* **Improved Performance:** Drastically reduces the number of deltas for functional component updates.
* **Enhanced Developer Experience:** Removes the requirement for developers to manually add stable ids to child nodes in functional components.
* **Encreased Robustness:** Centralizes the ID synchronization logic within the `FunctionalBase` class, making all functional components more stable by default.

**File to Change**: src/functional/component/Base.mjs

