---
id: 8890
title: Fix VDOM Update Collision Logic for Sparse Trees (Teleportation)
state: OPEN
labels:
  - bug
  - ai
  - regression
  - core
assignees: []
createdAt: '2026-01-26T20:26:23Z'
updatedAt: '2026-01-26T20:26:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8890'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix VDOM Update Collision Logic for Sparse Trees (Teleportation)

The recent implementation of Disjoint VDOM Updates (Teleportation) introduced a regression where disjoint child updates can be incorrectly dropped from the update batch.

This occurs when:
1. A Parent component is updating with `updateDepth > 1`.
2. The Parent has at least one merged child (triggering Sparse Tree generation via `mergedChildIds`).
3. A Disjoint Child (Distance < ParentDepth) is updating independently in the same batch.
4. The Disjoint Child is NOT in the Parent's `mergedChildIds` set.

The current collision filtering logic (`parentDepth > distance`) deletes the Disjoint Child's update, assuming the Parent will cover it. However, because the Parent is generating a Sparse Tree (`mergedChildIds` is present), `TreeBuilder` prunes any child not in the AllowList.

Result: The Disjoint Child is deleted from the batch AND pruned from the Parent payload, leading to a lost update (e.g., Loading Mask failing to show).

The fix is to refine the collision detection in `src/mixin/VdomLifecycle.mjs` to check if the Parent is excluding the Child (Sparse Mode) before deleting the disjoint update.

## Timeline

- 2026-01-26T20:26:24Z @tobiu added the `bug` label
- 2026-01-26T20:26:24Z @tobiu added the `ai` label
- 2026-01-26T20:26:24Z @tobiu added the `regression` label
- 2026-01-26T20:26:25Z @tobiu added the `core` label

