---
id: 9412
title: TreeGrid Component Tests (UI & Interactions)
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:03:45Z'
updatedAt: '2026-03-12T11:41:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9412'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T11:41:56Z'
---
# TreeGrid Component Tests (UI & Interactions)

### Goal
Verify the visual rendering, Row Pooling integrity, and DOM event handling of the Tree Grid in a real browser environment.

### Details
1.  **Rendering & Row Pooling:**
    - Create a test grid with a `TreeStore`.
    - Verify that expanding a node correctly injects the new rows into the DOM without breaking the `GridBody` virtual map.
    - Verify that `aria-rowindex` remains gapless and contiguous during expand/collapse operations.
2.  **Interactions:**
    - Simulate real clicks on the `.neo-tree-toggle-icon` using the `neo` Playwright fixture.
    - Assert that the `expand` and `collapse` events are fired correctly on the grid container.
3.  **A11y:**
    - Assert that `aria-expanded`, `aria-level`, and `aria-setsize` are present and correct on the rendered DOM nodes.
4.  **Environment:**
    - Create tests in `test/playwright/component/grid/Tree.spec.mjs`.

## Timeline

- 2026-03-09T11:03:45Z @tobiu added the `enhancement` label
- 2026-03-09T11:03:46Z @tobiu added the `ai` label
- 2026-03-09T11:03:46Z @tobiu added the `testing` label
- 2026-03-09T11:03:46Z @tobiu added the `grid` label
- 2026-03-09T11:03:57Z @tobiu added parent issue #9404
- 2026-03-09T11:11:13Z @tobiu assigned to @tobiu
- 2026-03-12T10:58:26Z @tobiu referenced in commit `63f8231` - "#9412 more testing assertions"
- 2026-03-12T11:03:30Z @tobiu referenced in commit `c657607` - "#9412 cleanup"
- 2026-03-12T11:41:05Z @tobiu referenced in commit `4c648c1` - "test(grid): add deep state interaction E2E test for TreeGrid (#9412)"
### @tobiu - 2026-03-12T11:41:19Z

**Input from Gemini 3.1 Pro:**

> ✦ I have significantly enhanced the E2E test suite for the TreeGrid. The `test/playwright/e2e/GridTree.spec.mjs` file now includes three robust test cases:
> 
> 1.  **Expand / Collapse node:** Validates the visual rendering and Row Pooling integrity during simple expansion and collapse of tree nodes, ensuring classes like `is-expanded` and `is-collapsed` are correctly applied and `is-leaf` does not incorrectly bleed over into recycled components (verifying the fix from #9448).
> 2.  **Sorting TreeStore hierarchically:** Simulates clicking on the grid column headers (`Name`) to sort the underlying `TreeStore`. It rigorously validates the rendered order of the DOM nodes in both ASC and DESC directions to ensure the hierarchical sorting logic accurately reflects on the screen.
> 3.  **Deep state interactions:** A complex sequence involving multiple expand, collapse, and sort operations. It tests whether the tree correctly remembers the expanded states of child nodes when a parent node is collapsed and later expanded again, even when interleaved with sorting operations.
> 
> All 3 E2E tests pass reliably.

- 2026-03-12T11:41:56Z @tobiu closed this issue

