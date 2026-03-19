---
id: 9521
title: 'Tree Grid: Optional Helper Lines for Tree Structures'
state: CLOSED
labels:
  - ai
  - feature
  - grid
assignees:
  - tobiu
createdAt: '2026-03-19T17:59:25Z'
updatedAt: '2026-03-19T18:01:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9521'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-19T18:01:00Z'
---
# Tree Grid: Optional Helper Lines for Tree Structures

This ticket introduces a new, optional feature for the `Neo.grid.column.Tree` to display helper lines (similar to classic Windows File Explorer). 

These lines help visualize the hierarchy and parent-child relationships, especially in deeply nested structures.

**Key Changes:**
1.  **`Neo.grid.column.Tree`:** Added a new reactive config `showHelperLines_` (default: `false`).
2.  **`Neo.grid.column.component.Tree`:** Added `isLastChild_` and `showHelperLines_` configs.
3.  **SCSS Styling:** 
    - Created `resources/scss/src/grid/column/Tree.scss` containing the complex CSS gradients to draw the lines without requiring extra DOM nodes. The gradients are designed to gracefully "break" around the Font Awesome caret icons using transparent gaps, avoiding messy intersections.
    - Added a 4px gap between the horizontal lines and the text content.
    - Handled `.is-last-child` state to properly terminate vertical lines.
4.  **Theming:** Created corresponding theme files for all 5 themes (`light`, `dark`, `neo-light`, `neo-dark`, `cyberpunk`) defining the `--tree-helper-line-color`. Dark themes use subtle colors (e.g., `#777` for dark, `var(--purple-600)` for neo-dark, `rgba(0, 210, 255, 0.4)` for cyberpunk).
5.  **Example:** Added a `Helper Lines` CheckBox to `examples/grid/treeBigData/ControlsContainer.mjs` to toggle the feature dynamically.

## Timeline

- 2026-03-19T17:59:26Z @tobiu added the `ai` label
- 2026-03-19T17:59:27Z @tobiu added the `feature` label
- 2026-03-19T17:59:27Z @tobiu added the `grid` label
- 2026-03-19T18:00:06Z @tobiu referenced in commit `b71e4e3` - "Tree Grid: Optional Helper Lines for Tree Structures (#9521)"
- 2026-03-19T18:00:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-19T18:00:28Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the tree helper lines feature.
> 
> ### Implementation Details:
> *   Added `showHelperLines` config to `Neo.grid.column.Tree` and its underlying `component.Tree`.
> *   Implemented a pure CSS solution using CSS Gradients in `resources/scss/src/grid/column/Tree.scss` to draw the tree lines without adding any new DOM nodes.
> *   **Intersection Avoidance**: The lines are drawn using background gradients with transparent gaps that sit perfectly behind the Font Awesome carets. This creates the illusion of a solid background behind the icon without needing an actual background circle that would look messy over striped or hovered rows.
> *   Added a subtle 4px gap before the horizontal lines meet the text.
> *   Increased the CSS specificity to ensure that the `.neo-grid-tree-column-cell` correctly nullifies `padding-top` and `padding-bottom`, allowing the cell to stretch to 100% height and avoid visual gaps between rows.
> *   Configured subtle theme variables for dark, neo-dark, and cyberpunk themes.
> *   Added a toggle checkbox to the `treeBigData` grid example.
> 
> The changes have been committed and pushed.

### @tobiu - 2026-03-19T18:00:44Z

<img width="1268" height="1076" alt="Image" src="https://github.com/user-attachments/assets/7a5b7f1a-4fb8-4c95-a1bf-7ee8bf726527" />

- 2026-03-19T18:01:00Z @tobiu closed this issue

