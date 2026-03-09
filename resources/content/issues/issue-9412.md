---
id: 9412
title: TreeGrid Component Tests (UI & Interactions)
state: OPEN
labels:
  - enhancement
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:03:45Z'
updatedAt: '2026-03-09T11:11:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9412'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

