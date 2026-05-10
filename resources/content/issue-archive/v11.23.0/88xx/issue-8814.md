---
id: 8814
title: Race condition in Portal Toolbar causes duplicate DOM nodes
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-01-19T15:08:24Z'
updatedAt: '2026-01-20T03:31:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8814'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T03:31:18Z'
---
# Race condition in Portal Toolbar causes duplicate DOM nodes

Duplicate DOM nodes appear in the Portal Toolbar when navigating to a ticket route (e.g., `#/news/tickets/8691`).
This appears to be a race condition involving rapid `hidden: false` updates triggered by state bindings on `PageContainer`, causing both the parent container and the child component to attempt to insert the child node into the DOM simultaneously.

### Reproduction
1. Navigate to `#/news/tickets/8691` (or similar).
2. Observe the "next page" button (right side of toolbar).
3. Sometimes, it appears duplicated in the live DOM, while the VDOM remains correct.

### Expected Behavior
The DOM should exactly match the VDOM (one button instance).

### Hypotheses
- Competing VDOM updates from Parent (Toolbar) and Child (Button) when `hidden` toggles.
- `VdomLifecycle` or `VDomUpdate` not correctly merging or locking updates during `mount` or `insertNode` operations.


## Timeline

- 2026-01-19T15:08:25Z @tobiu added the `bug` label
- 2026-01-19T15:08:26Z @tobiu added the `ai` label
### @tobiu - 2026-01-19T15:08:54Z

<img width="606" height="218" alt="Image" src="https://github.com/user-attachments/assets/613ff5a4-18e9-43b7-b456-35145d7ee96f" />

### @tobiu - 2026-01-19T16:45:04Z

**Input from Gemini 3 Pro:**

> ✦ I have conducted a deep investigation into the race condition and encountered a significant logical conflict in the test suite that requires a fresh look.
> 
> ### The Conflict
> We have two existing test suites with contradictory expectations regarding VDOM update merging at `updateDepth: 1` (the default):
> 
> 1.  **`RealWorldUpdates.spec.mjs`**: Fails unless merging is enabled for direct children (Depth 1, Distance 1). It expects a parent update to return child deltas. This implies `hasUpdateCollision` should use `<=` (so `1 <= 1` is true).
> 2.  **`AsymmetricUpdates.spec.mjs`**: Explicitly expects **NO** collision for Depth 1 vs Distance 1. It asserts `expect(hasCollision).toBe(false)`. This implies `hasUpdateCollision` should use `<` (so `1 < 1` is false).
> 
> ### The Paradox
> The original codebase used `<` (verified). However, `RealWorldUpdates` reportedly passed. This is mathematically impossible under the standard merging logic: if `1 < 1` is false, the child does not merge, the parent updates alone (Depth 1), prunes the child placeholder, and returns 0 deltas (failing the test).
> 
> **Hypothesis:** There is a "hidden variable" or mechanism in the original passing state that allowed `RealWorldUpdates` to pass despite `<`. Possibilities:
> - `parent.updateDepth` was somehow initialized to > 1 (e.g., via `Container` logic or test setup side effects).
> - The test environment (`domApiRenderer: true`) interacts with `TreeBuilder` differently than analyzed.
> 
> ### The Proposed Fix (Verified in Isolation)
> I have implemented a race condition guard that successfully fixes the original "Duplicate DOM Node" issue:
> 1.  **`VDomUpdate.hasInFlightDescendant(ownerId, updateDepth)`**: Detects if any descendant is currently updating.
> 2.  **`VdomLifecycle.isChildUpdating(resolve)`**: Defers the parent's update if a descendant is in-flight, preventing the parent from overwriting the child's concurrent work.
> 
> This fix works perfectly for `RaceCondition.spec.mjs`. The blocker is integrating it without breaking the conflicting legacy tests.
> 
> ### Next Steps for Fresh Session
> 1.  **Checkout `dev` (Clean State)**: Run `RealWorldUpdates.spec.mjs` **immediately** with logging to confirm it passes and inspect `parent.updateDepth` at runtime. This will solve the "Why did it pass?" mystery.
> 2.  **Apply Fix**: Re-apply the `isChildUpdating` logic.
> 3.  **Resolve Conflict**: If `RealWorldUpdates` passes on `dev` due to a specific depth, ensure my fix preserves that state. If it relies on `<=` (merging), we must reconcile it with `AsymmetricUpdates` (possibly by updating the test expectation if the architecture *should* support merging).

- 2026-01-19T16:48:48Z @tobiu referenced in commit `8789ba9` - "feat: Add race condition detection and tests (#8814)"
### @tobiu - 2026-01-19T16:49:57Z

**Input from Gemini 3 Pro:**

> ✦ I have pushed the current investigation state to a new feature branch: `feat/8814-race-condition`.
> 
> **Branch State:**
> - **Code:** `src/mixin/VdomLifecycle.mjs` has the new `isChildUpdating` logic enabled (uncommented). `hasUpdateCollision` uses `<` (default dev state, preventing direct child merging).
> - **Tests:**
>     - `test/playwright/unit/vdom/RaceCondition.spec.mjs`: **PASSES**. Confirms the `isChildUpdating` fix works for the specific race condition.
>     - `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`: **FAILS**. Fails because it expects merging (Child updates merged into Parent), but `<` logic prevents it at default depth. Logging added to inspect depth.
>     - `test/playwright/unit/vdom/AsymmetricUpdates.spec.mjs`: **FAIL/PASS**. Adjusted to expect `true` (collision) in an attempt to reconcile with `<=`, but current code is `<`.
> 
> **How to Use:**
> Future sessions can diff `feat/8814-race-condition` against `dev` to see the exact implementation of the race condition fix and the new tests (`RaceCondition.spec.mjs`, `Collision.spec.mjs`, `ReverseCollision.spec.mjs`).
> 
> **Recommended Diff:**
> ```bash
> git diff dev...feat/8814-race-condition
> ```
> 
> This branch captures the "broken" state where the fix works for the new bug but exposes the latent conflict with `RealWorldUpdates`. It serves as the starting point for resolving the "Merging vs. Blocking" architectural paradox.

- 2026-01-20T03:25:36Z @tobiu cross-referenced by #8823
- 2026-01-20T03:28:18Z @tobiu cross-referenced by #8824
### @tobiu - 2026-01-20T03:31:07Z

Fix implemented and verified with new test suite. Merging to dev.

- 2026-01-20T03:31:18Z @tobiu closed this issue

