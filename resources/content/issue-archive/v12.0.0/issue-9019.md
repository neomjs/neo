---
id: 9019
title: Fix Playwright Teleportation Tests for Fixed-DOM-Order Grid
state: CLOSED
labels:
  - ai
  - testing
  - regression
assignees:
  - tobiu
createdAt: '2026-02-06T18:14:52Z'
updatedAt: '2026-02-06T18:51:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9019'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T18:51:44Z'
---
# Fix Playwright Teleportation Tests for Fixed-DOM-Order Grid

**Objective:**
Update `test/playwright/unit/grid/Teleportation.spec.mjs` to align with the new "Fixed-DOM-Order" Row Pooling architecture. The current tests fail because they expect behaviors (DOM moves, direct VDOM structure access) that have been intentionally obsoleted by recent refactorings (#9012, #9017).

**Issue 1: Expectation Mismatch (Zero Moves)**
- **Failure:** `expect(moveNodes.length).toBe(3)` received `0`.
- **Reason:** The Fixed-DOM-Order strategy eliminates `moveNode` operations for rows during scrolling.
- **Fix:** Update the test to expect `0` move deltas for rows. Verify text updates count and adjust if necessary.

**Issue 2: VDOM Traversal Failure**
- **Failure:** `TypeError: Cannot read properties of undefined (reading '1')` when accessing `firstRenderedRow.cn[1]`.
- **Reason:** `GridBody` now contains `Neo.grid.Row` *references* (placeholders) in its `vdom.cn`, not the full VDOM tree of the rows. The test tries to access cell `cn[1]` directly from the Body's VDOM, which is no longer valid.
- **Fix:**
    - Resolve the `Neo.grid.Row` instance from the Body's items (using `getComponent`).
    - Access the *Row's* own `vdom` property to inspect cells and content.

**Plan:**
1.  Modify `Teleportation.spec.mjs` to assert `moveNodes.length` is 0.
2.  Refactor the DOM inspection logic to retrieve the Row component instance before inspecting its VDOM structure.
3.  Run the test to verify stability.

**Related:**
- #9017 (Grid Body Refactor)
- #9012 (Fixed-DOM-Order)

## Timeline

- 2026-02-06T18:14:54Z @tobiu added the `ai` label
- 2026-02-06T18:14:54Z @tobiu added the `testing` label
- 2026-02-06T18:14:54Z @tobiu added the `regression` label
- 2026-02-06T18:51:20Z @tobiu referenced in commit `0524911` - "test: Fix Teleportation specs for Fixed-DOM-Order Grid (#9019)"
### @tobiu - 2026-02-06T18:51:23Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `test/playwright/unit/grid/Teleportation.spec.mjs` to align with the new **Fixed-DOM-Order** architecture.
> 
> **Changes:**
> 1.  **Updated Expectations:**
>     -   `moveNodes` expectation set to `0` (was 3 or 8), confirming that rows are recycled in-place without moving in the DOM.
>     -   `insertNodes` expectation set to `0` (was 3), confirming full pool reuse.
>     -   `textUpdates` expectation set to `14` (was 11), accounting for the recycling of previously "inserted" rows.
> 2.  **Robust Row Inspection:**
>     -   Refactored the test logic to identify rows by checking the component's `rowIndex` property, rather than assuming `cn[0]` corresponds to the top logical row. This handles the visual wrapping inherent in the fixed-order strategy.
> 3.  **Async Synchronization:**
>     -   Added `await grid.timeout(50)` after scrolling to allow child component updates (e.g., Button text) to fully settle before assertions, resolving race conditions in the test environment.
> 4.  **VDOM Inspection:**
>     -   Updated assertions to check `.text` instead of `.html` on button text nodes, matching `Neo.button.Base` implementation.
> 
> All tests are now passing. Code pushed to `dev`.

- 2026-02-06T18:51:27Z @tobiu assigned to @tobiu
- 2026-02-06T18:51:44Z @tobiu closed this issue

