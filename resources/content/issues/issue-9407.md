---
id: 9407
title: Create `Neo.grid.column.Tree` & Cell Component
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T10:52:17Z'
updatedAt: '2026-03-09T11:10:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9407'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create `Neo.grid.column.Tree` & Cell Component

### Goal
Implement the specialized column renderer for Tree Grids, using a nested component architecture to handle indentation, toggle states, and event emission without breaking Row Pooling.

### Details
1.  **`src/grid/column/Tree.mjs`:**
    - Extends `Neo.grid.column.Component`.
    - Defaults to using `Neo.grid.column.tree.Component`.
    - Implements `expand(record)` and `collapse(record)` proxy methods to forward the interaction to the `TreeStore`.

2.  **`src/grid/column/tree/Component.mjs`:**
    - Extends `Neo.component.Base`.
    - VDOM Structure: Indentation Spacer (CSS variable bound), Toggle Icon (CSS class bound), and Content Node.
    - Reacts to `record` changes (during scroll recycling) to update its internal `depth`, `expanded`, and `isLeaf` states.

3.  **SCSS Implementation (src + 5 themes):**
    - `src/.../Component.scss`: Structural flex layout and CSS calc() for indentation.
    - `theme-*/.../Component.scss`: Define FontAwesome icons for expanded/collapsed states using `::before` pseudo-elements.

4.  **Interaction & Events:**
    - Add click delegation on the toggle icon.
    - The column must trigger the expansion/collapse via the `TreeStore`.
    - **Crucial:** The `TreeStore` (or the column itself) must fire `expand` and `collapse` events.
    - These events should bubble up to (or be explicitly fired on) the `grid.Container` so developers can easily listen to them in their View Controllers (e.g., `onNodeExpand`, `onNodeCollapse`).

## Timeline

- 2026-03-09T10:52:18Z @tobiu added the `enhancement` label
- 2026-03-09T10:52:18Z @tobiu added the `design` label
- 2026-03-09T10:52:18Z @tobiu added the `ai` label
- 2026-03-09T10:52:19Z @tobiu added the `grid` label
- 2026-03-09T10:52:27Z @tobiu added parent issue #9404
### @tobiu - 2026-03-09T11:09:08Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Guidance for Agents:**
> 
> When implementing the styling for this component, you MUST adhere to the Neo.mjs split styling architecture:
> 
> 1. **Structural Layout (`resources/scss/src/grid/column/tree/Component.scss`)**:
>    - This file should ONLY contain layout rules (Flexbox alignment, margins).
>    - Use a CSS `calc()` with a variable for indentation: `width: calc(var(--tree-depth, 0) * var(--tree-indent, 16px));`
> 
> 2. **Theme Variables (`resources/scss/theme-*/grid/column/tree/Component.scss`)**:
>    - You must create this file for ALL 5 themes (`theme-neo-dark`, `theme-neo-light`, `theme-neo-light-rich`, `theme-neo-dark-rich`, `theme-epona`).
>    - Define the actual CSS variables (e.g., `--tree-indent`) here.
>    - Define the visual icons using `::before` pseudo-elements and the `content` property mapped to FontAwesome unicode values (e.g., `content: '\f054'` for collapsed, `\f078` for expanded).
> 
> **Important Files to Reference:**
> - Look at `src/grid/column/Component.mjs` to understand how the cell recycling works via `afterSetRecord`.
> - Look at `resources/scss/theme-neo-dark/grid/column/IconLink.scss` for an example of how to scope theme-specific column styling.

- 2026-03-09T11:10:50Z @tobiu assigned to @tobiu

