---
id: 9466
title: 'TreeGrid Big Data Demo: Create E2E Tests'
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-03-13T11:09:42Z'
updatedAt: '2026-03-13T11:09:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9466'
author: tobiu
commentsCount: 0
parentIssue: 9461
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

