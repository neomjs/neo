---
id: 8832
title: 'Enhancement: Implement Sparse Tree Generation for VDOM Updates'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T18:18:19Z'
updatedAt: '2026-01-20T18:27:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8832'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T18:27:47Z'
---
# Enhancement: Implement Sparse Tree Generation for VDOM Updates

Current VDOM update logic using `updateDepth` can lead to inefficient "wasteful expansion" of clean subtrees. When a parent updates with `updateDepth: 2` (or greater), all children at that depth are expanded, even if they have no changes.

This ticket aims to implement "Sparse Tree Generation" in `Neo.util.vdom.TreeBuilder`.

**Goals:**
1.  **Selective Expansion:** Only expand branches that lead to "dirty" components (merged updates) or are dirty themselves.
2.  **Pruning:** "Clean" siblings that are not part of the update path should be sent as placeholders (pruned), effectively excluding them from the parent's update transaction.
3.  **Parallelism:** By pruning clean siblings, they remain free to execute their own independent updates in parallel, resolving the "Blocked Sibling" concurrency issue.
4.  **Verification:** Add unit tests to prove that clean siblings are pruned when `updateDepth` allows for deeper traversal.

**Tasks:**
-   Create a failing test case demonstrating current "wasteful expansion".
-   Enhance `VDomUpdate.mjs` to track "Bridge Paths" (ancestors that must be expanded to reach a merged child).
-   Update `TreeBuilder.mjs` to use this bridge logic for conditional expansion.
-   Verify that clean siblings are pruned and can update in parallel.

## Timeline

- 2026-01-20T18:18:20Z @tobiu added the `enhancement` label
- 2026-01-20T18:18:20Z @tobiu added the `ai` label
- 2026-01-20T18:18:20Z @tobiu added the `performance` label
- 2026-01-20T18:18:21Z @tobiu added the `core` label
- 2026-01-20T18:18:26Z @tobiu assigned to @tobiu
- 2026-01-20T18:27:17Z @tobiu referenced in commit `274b9f5` - "enhancement: Implement Sparse Tree Generation for VDOM Updates (#8832)

Introduces an optimization where clean siblings are pruned from the VDOM tree during a merged update cycle.

1. Modified 'VDomUpdate.getMergedChildIds' to include 'Bridge Paths' (ancestors leading to dirty children).

2. Updated 'TreeBuilder' to use this AllowList for selective pruning, ensuring only dirty branches are expanded.

3. Added 'SparseUpdates.spec.mjs' to verify selective expansion and pruning behavior."
### @tobiu - 2026-01-20T18:27:27Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Sparse Tree Generation.
> 
> **Changes:**
> 1.  **`VDomUpdate.mjs`**: Modified `getMergedChildIds` to calculate and include "Bridge Paths". It now returns a Set containing not just the merged children, but all intermediate ancestors required to reach them.
> 2.  **`TreeBuilder.mjs`**: Enhanced expansion logic. If a `mergedChildIds` AllowList is present, it now prunes (sends as placeholder) any branch that is not in the list, even if `updateDepth` would otherwise allow expansion.
> 3.  **`SparseUpdates.spec.mjs`**: Added a new unit test proving that clean siblings are pruned (sent as placeholders with no `tag`) during a merged update cycle.
> 
> **Result:**
> Verified that `updateDepth: 2` (or greater) no longer causes "wasteful expansion" of clean subtrees. The VDOM worker receives a truly sparse tree containing only the necessary updates and the bridges to reach them. All existing VDOM tests pass.

- 2026-01-20T18:27:47Z @tobiu closed this issue
- 2026-01-20T18:35:33Z @tobiu cross-referenced by #8833

