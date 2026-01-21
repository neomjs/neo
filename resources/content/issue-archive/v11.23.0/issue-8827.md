---
id: 8827
title: 'test: Comprehensive Verification of Asymmetric VDOM Merging and Callbacks'
state: CLOSED
labels:
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T11:30:09Z'
updatedAt: '2026-01-20T17:09:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8827'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T17:09:23Z'
---
# test: Comprehensive Verification of Asymmetric VDOM Merging and Callbacks

This task aims to rigorously stress-test the new **Scoped + Aggregated** VDOM engine (v11) to ensure precision, efficiency, and correctness of the new merging logic (`canMergeUpdate`) and its integration with the promise/callback system.

**Objectives:**
1.  Verify **Selective Merging:** Ensure that when a parent updates, it *only* aggregates dirty children, leaving clean children pruned/untouched.
2.  Verify **Callback Execution:** Ensure that promises returned by `child.promiseUpdate()` are correctly resolved when the child is merged into a parent's update cycle.
3.  Verify **State Management:** Ensure `needsVdomUpdate` is correctly reset for merged children.

**Key Test Scenarios:**

1.  **Selective Merging (The Toolbar Case):**
    *   Setup: Container with 3 Buttons.
    *   Action: Dirty Button 1 and 3. Keep Button 2 clean. Trigger Parent update.
    *   Expectation: Update bundle includes Parent, Btn1, Btn3. **Excludes** Btn2.

2.  **Promise/Callback Signal Chain:**
    *   Setup: Child component waiting on `promiseUpdate()`.
    *   Action: Merge Child into Parent update.
    *   Expectation: Child's promise resolves when Parent finishes. Verify callback data and timing.

3.  **Nested Merging (Transitive chains):**
    *   Setup: Parent -> Child (Container) -> Grandchild.
    *   Action: Dirty all three.
    *   Expectation: Grandchild merges to Child, Child merges to Parent. Parent delta contains all.

**Implementation:**
*   Create `test/playwright/unit/vdom/AsymmetricMerging.spec.mjs`.
*   Use explicit tracking arrays to verify callback firing order.

## Timeline

- 2026-01-20T11:30:10Z @tobiu added the `testing` label
- 2026-01-20T11:30:10Z @tobiu added the `core` label
- 2026-01-20T11:30:25Z @tobiu assigned to @tobiu
- 2026-01-20T17:08:33Z @tobiu referenced in commit `954791b` - "test: Add Comprehensive Asymmetric VDOM Merging Verification (#8827) & docs"
### @tobiu - 2026-01-20T17:08:50Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the verification of the Asymmetric VDOM Merging logic.
> 
> **Implementation:**
> -   Created `test/playwright/unit/vdom/AsymmetricMerging.spec.mjs`.
> -   Implemented robust test patterns using `testRun` counters for unique IDs and `setSilent` + `promiseUpdate` for state mutation.
> 
> **Verified Scenarios:**
> 1.  **Selective Merging:** Confirmed that parent updates only aggregate dirty children (e.g., Toolbar case).
> 2.  **Promise/Callback Chain:** Confirmed that `child.promiseUpdate()` resolves correctly when merged into a parent update.
> 3.  **Nested Merging:** Confirmed correct bundling of Grandchild -> Child -> Parent updates.
> 4.  **Custom Config Hooks:** Confirmed that callbacks in custom config setters are executed even when merged.
> 5.  **Leapfrog Merging:** Validated that a Grandchild can merge into a Grandparent even if the intermediate Parent is clean/skipped.
> 6.  **Structural Merging:** Validated that adding a child (`container.add`) merges correctly into a pending parent update.
> 
> **Documentation:**
> -   Enhanced `src/manager/VDomUpdate.mjs` and `src/mixin/VdomLifecycle.mjs` with intent-driven JSDoc explaining the merging strategies, optimization goals, and leapfrog capabilities.
> 
> All tests passed successfully. The VDOM merging engine is robust and well-documented.

- 2026-01-20T17:09:23Z @tobiu closed this issue
- 2026-01-20T17:13:57Z @tobiu referenced in commit `fc9bc36` - "fix: Resolve ntype conflict in AsymmetricMerging tests (#8827)"

