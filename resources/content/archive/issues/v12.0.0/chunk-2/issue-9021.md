---
id: 9021
title: Create Playwright Unit Tests for Grid-Store Interactions
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees: []
createdAt: '2026-02-07T00:35:12Z'
updatedAt: '2026-02-07T00:48:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9021'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T00:48:46Z'
---
# Create Playwright Unit Tests for Grid-Store Interactions

# Create Playwright Unit Tests for Grid-Store Interactions

**Objective:**
Create a new Playwright unit test suite (`test/playwright/unit/grid/StoreInteractions.spec.mjs`) to verify the interaction between the `GridContainer` (specifically `GridBody`) and its `Store` during runtime data mutations.

**Scope:**
The tests must verify that the **Fixed-DOM-Order** architecture is maintained during dynamic data changes. We expect **minimal deltas** (content updates only, no row reordering/insertion/removal) for operations that fit within the existing row pool.

**Key Scenarios to Test:**

1.  **Runtime Insert (`store.add` / `store.insert`):**
    -   Insert a record at the top (index 0).
    -   **Verify:** Visible rows should update their content (shifting data down).
    -   **Assert:** ZERO structural deltas (`moveNode`, `insertNode`) for the rows themselves. Only content (`innerHTML`, `text`) and `style` (transform) updates.

2.  **Runtime Remove (`store.remove`):**
    -   Remove a visible record.
    -   **Verify:** Remaining rows shift up (content update).
    -   **Assert:** ZERO structural deltas. Unused rows at the bottom of the pool should be hidden or cleared, not removed from DOM.

3.  **Runtime Sort (`store.sort`):**
    -   Trigger a sort operation.
    -   **Verify:** Rows display records in the new order.
    -   **Assert:** ZERO row moves. The physical DOM rows should remain in place; only their content changes.

4.  **Runtime Filter (`store.filter`):**
    -   Apply a filter that reduces the dataset.
    -   **Verify:** Visible rows update.
    -   **Assert:** Correct number of rows are visible. Excess rows in the pool are hidden (e.g., `display: none` or empty content), NOT removed from DOM.

**Technical Details:**
-   Use `captureDeltas` helper (similar to `Pooling.spec.mjs`) to inspect VDOM actions.
-   Ensure `Neo.config.useVdomWorker` is `false` to test logic synchronously.
-   Mock `ResizeObserver` and `DomAccess` as needed.

**Why:**
To ensure that standard store operations do not break the high-performance rendering strategy of the new Grid implementation.

## Timeline

- 2026-02-07T00:35:13Z @tobiu added the `ai` label
- 2026-02-07T00:35:13Z @tobiu added the `testing` label
- 2026-02-07T00:35:14Z @tobiu added the `performance` label
- 2026-02-07T00:44:15Z @tobiu referenced in commit `6a39795` - "test: Add Grid Store Interaction unit tests (#9021)"
### @tobiu - 2026-02-07T00:44:31Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented and verified the Playwright unit test suite for Grid & Store Interactions (`test/playwright/unit/grid/StoreInteractions.spec.mjs`).
> 
> **Verification Results:**
> - **Insert / Remove:** Confirmed strict recycling. Adding/removing items shifts content in existing rows with **ZERO** structural DOM deltas (no inserts/removes of rows).
> - **Sort:** Verified sorting updates content in-place without moving physical row elements.
> - **Filter:** Confirmed that filtering hides unused rows (via `display: none` or similar) instead of removing them from the DOM, maintaining the Fixed-DOM-Order architecture.
> - **Delta Efficiency:** Validated that the number of VDOM updates is minimal and bounded (roughly proportional to visible cells), ensuring O(1) scalability for data mutations.
> 
> This suite acts as a regression guard for ensuring Store operations leverage the Grid's high-performance architecture.

- 2026-02-07T00:48:02Z @tobiu referenced in commit `5ada0ea` - "test: Enhance assertions for Grid Store Interactions (#9021)"
### @tobiu - 2026-02-07T00:48:14Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the unit tests with direct VDOM/VNode assertions to verify the live DOM state matches the logical updates.
> 
> **Enhancements:**
> - **Runtime Insert:** Explicitly verifies that the VDOM cell content and VNode `innerHTML` at index 0 contain "New Row".
> - **Runtime Remove:** Confirms that the VDOM/VNode at index 0 updates to display the shifted record ("Row 1").
> - **Runtime Sort:** Asserts that the VDOM/VNode reflects the new sort order ("Row 19" at top).
> - **Runtime Filter:** Verifies that visible rows have `style.display: null` (visible) and unused/pooled rows have `style.display: 'none'` in both VDOM and VNode, confirming the "hide-don't-remove" strategy.
> 
> These assertions guarantee that the visual representation (what the user sees) is correctly synchronized with the efficient internal state changes.

- 2026-02-07T00:48:47Z @tobiu closed this issue
- 2026-02-07T01:00:13Z @tobiu referenced in commit `2d67727` - "fix(Collection): Allow 0 as a valid key in splice (#9021)"

