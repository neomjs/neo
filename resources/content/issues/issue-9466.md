---
id: 9466
title: 'TreeGrid Big Data Demo: Create E2E Tests'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-13T11:09:42Z'
updatedAt: '2026-03-13T13:29:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9466'
author: tobiu
commentsCount: 1
parentIssue: 9461
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T13:29:26Z'
---
# TreeGrid Big Data Demo: Create E2E Tests

### Goal
Create comprehensive end-to-end (E2E) tests for the new `TreeGrid Big Data` demo using Playwright to ensure performance, stability, and correctness of core interactions (expand/collapse, scrolling, filtering) under heavy data loads.

### Inspiration & Context
- `test/playwright/e2e/GridTree.spec.mjs`: Serves as a template for tree-specific interactions (expand/collapse, node visibility, hierarchical sorting).
- `test/playwright/e2e/GridScrollBenchmark.spec.mjs`: Serves as a template for performance testing, handling large scrolling areas, and isolating layout jank.

### Implementation Steps

1.  **Create Test File:** Create a new file `test/playwright/e2e/GridTreeBigData.spec.mjs`.
2.  **Basic Initialization & Load Test:**
    -   Navigate to `/examples/grid/treeBigData/index.html`.
    -   Wait for the grid to render its initial rows.
    -   Verify that the `ControlsContainer` is fully initialized.
3.  **Interaction Testing (Expand/Collapse):**
    -   Target a root folder and trigger an expansion.
    -   Verify that the correct number of child rows are injected into the DOM.
    -   Verify that the bulk `Expand All` and `Collapse All` buttons in the `ControlsContainer` function correctly without crashing the main thread.
4.  **Performance/Scroll Testing:**
    -   Implement vertical and horizontal scroll tests similar to the `GridScrollBenchmark`.
    -   Ensure smooth scrolling (native scroll) across a high volume of rows and columns.
5.  **Filtering Validation:**
    -   Apply a filter via the `ControlsContainer` (e.g., `firstname`).
    -   Assert that the `TreeStore` correctly filters the data and that parent folders of matching children remain visible.

## Timeline

- 2026-03-13T11:09:44Z @tobiu added the `enhancement` label
- 2026-03-13T11:09:44Z @tobiu added the `ai` label
- 2026-03-13T11:09:44Z @tobiu added the `testing` label
- 2026-03-13T11:09:54Z @tobiu assigned to @tobiu
- 2026-03-13T11:09:58Z @tobiu added parent issue #9461
- 2026-03-13T12:45:54Z @tobiu referenced in commit `cae1d2a` - "#9466 initial e2e setup"
- 2026-03-13T13:28:41Z @tobiu referenced in commit `0d8bca4` - "test(E2E): Rewrite GridTreeBigData to handle virtual scroll metrics (#9466)

- Modified expand/collapse test to rely on data-record-id to circumvent stale locators and constant virtual viewport row counts
- Modified filter test to test both a valid filter (forcing ancestor expansion and row count increase) and an invalid filter (forcing row count to 0)
- Verified that clearing the filter restores the grid projection while retaining auto-expanded parent nodes
- Added toggling for the controls container to ensure robust click execution
- Added high-level architectural comments detailing the testing strategy"
### @tobiu - 2026-03-13T13:29:06Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed and pushed the updated E2E tests for the `TreeGrid Big Data` example.
> 
> - Changed the test logic to work robustly with virtual scrolling by looking for specific `data-record-id` changes and structural shifts, rather than exact count assertions for expanded/filtered states.
> - Handled the sliding `ControlsContainer` toggling to ensure the controls panel does not obstruct mouse events or go out of bounds.
> - Augmented the `Filtering` test to evaluate both positive matches (forcing auto-expansion) and invalid matches (forcing 0 results), testing the persistence of expansion states after clearing the filter.
> - Applied the Knowledge Base Enhancement Strategy by adding architectural comments to `TreeStore.#rebuildKeysAndCount()` and the E2E test file itself to guide future tests on virtual scrollers.

- 2026-03-13T13:29:26Z @tobiu closed this issue

