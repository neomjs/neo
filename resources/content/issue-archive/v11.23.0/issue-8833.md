---
id: 8833
title: 'Enhancement: Verify Sparse Leapfrog Merging and Pruning'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T18:35:32Z'
updatedAt: '2026-01-20T18:38:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8833'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T18:38:45Z'
---
# Enhancement: Verify Sparse Leapfrog Merging and Pruning

To confirm the robustness of the new "Sparse Tree Generation" optimization (Ticket #8832), we need to enhance the "Leapfrog Merging" test scenario in `AsymmetricMerging.spec.mjs`.

**Goals:**
1.  **Replace `-1` with `2`:** The Leapfrog test currently uses `updateDepth: -1` (infinite). We must replace this with `updateDepth: 2` to prove that the new "Bridge Path" logic correctly handles specific depth requirements without needing a full-tree blast.
2.  **Verify Pruning:** Add a "Clean Uncle" (sibling of the Bridge Parent) to the test structure.
3.  **Assertion:** Verify that the "Bridge Parent" is expanded (to reach the Grandchild) but the "Clean Uncle" is pruned (sent as a placeholder), proving the selectivity of the new system.

**Tasks:**
- Modify `test/playwright/unit/vdom/AsymmetricMerging.spec.mjs`.
- Update the "Leapfrog Merging" test case.
- Inspect the resulting `deltas` or `vdom` structure to confirm pruning behavior.

## Timeline

- 2026-01-20T18:35:33Z @tobiu added the `enhancement` label
- 2026-01-20T18:35:33Z @tobiu added the `ai` label
- 2026-01-20T18:35:33Z @tobiu added the `testing` label
- 2026-01-20T18:35:34Z @tobiu added the `core` label
- 2026-01-20T18:35:43Z @tobiu assigned to @tobiu
- 2026-01-20T18:38:19Z @tobiu referenced in commit `58a0b1f` - "test: Enhance Leapfrog Merging test to verify Sparse Tree Generation (#8833)

Updated 'AsymmetricMerging.spec.mjs' to use updateDepth: 2 instead of -1.

Added a 'Clean Uncle' component to verify that it is correctly pruned while the 'Bridge Parent' is expanded."
### @tobiu - 2026-01-20T18:38:27Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the "Leapfrog Merging" test case in `AsymmetricMerging.spec.mjs`.
> 
> **Changes:**
> 1.  **Updated Depth:** Replaced `updateDepth: -1` with `updateDepth: 2`. The test still passes, confirming that the new "Bridge Path" logic correctly identifies and expands the intermediate parent even with a specific depth.
> 2.  **Verify Pruning:** Added a `clean-uncle` component to the Grandparent. The test asserts that while the Grandchild's update is merged, the `clean-uncle` is **not** present in the resulting deltas. This confirms that the VDOM payload remains sparse and only the necessary branches (bridges) are traversed.
> 
> **Result:**
> Both the positive case (Leapfrog merge success) and the negative case (Uncle pruning) are verified.

- 2026-01-20T18:38:46Z @tobiu closed this issue

