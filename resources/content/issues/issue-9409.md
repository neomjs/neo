---
id: 9409
title: CSS Animations for TreeGrid Expand/Collapse
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:01:21Z'
updatedAt: '2026-03-09T11:11:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9409'
author: tobiu
commentsCount: 0
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# CSS Animations for TreeGrid Expand/Collapse

### Goal
Provide smooth, CSS-based visual transitions when expanding or collapsing nodes in a Tree Grid, enhancing the user experience.

### Details
1.  **Animation Strategy (Row Pooling):**
    - Because `GridBody` uses row pooling and absolute positioning (`transform: translate3d`), we cannot rely on simple `height: 0` to `height: 100%` transitions on the container.
    - Instead, we should implement a staggered fade-in (`opacity`) or slight vertical slide (`translateY`) for newly rendered rows that enter the visible array during an `expand` operation.
    - During a `collapse`, rows might quickly fade out before the view collapses.
2.  **CSS Implementation:**
    - Introduce new CSS classes (e.g., `.neo-tree-row-entering`, `.neo-tree-row-leaving`).
    - Define keyframes or transitions in `resources/scss/src/grid/Row.scss`.
3.  **Lifecycle Hook:**
    - The `GridBody` (or `Row`) needs to conditionally apply these classes based on the `TreeStore`'s recent mutation events.
    - A config like `animateTreeNodes: true` (defaulting to `false` for maximum performance) should govern this behavior.

## Timeline

- 2026-03-09T11:01:21Z @tobiu added the `enhancement` label
- 2026-03-09T11:01:22Z @tobiu added the `design` label
- 2026-03-09T11:01:22Z @tobiu added the `ai` label
- 2026-03-09T11:01:22Z @tobiu added the `grid` label
- 2026-03-09T11:01:33Z @tobiu added parent issue #9404
- 2026-03-09T11:11:02Z @tobiu assigned to @tobiu

