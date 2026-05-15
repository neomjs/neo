---
id: 8577
title: Refactor Neo.tree.List to use removeDom for collapsed nodes
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-12T05:00:54Z'
updatedAt: '2026-01-12T06:03:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8577'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T06:03:16Z'
---
# Refactor Neo.tree.List to use removeDom for collapsed nodes

Current implementation of `Neo.tree.List` renders all nodes in the DOM and hides collapsed branches using CSS `display: none`. This causes performance issues with large trees.

Refactor to use the `removeDom` VDOM property to physically remove collapsed branches from the DOM.

**Changes:**
1.  Update `createItemLevel` in `src/tree/List.mjs` to set `removeDom: true` for hidden branches instead of `style.display: 'none'`.
2.  Update `onItemClick` logic to toggle the `removeDom` property of the child `ul` container instead of relying on CSS cascade.
3.  Update `expandAll` and `collapseAll` to handle the `removeDom` property.
4.  Remove obsolete `display: none` / `display: block` rules from `resources/scss/src/tree/List.scss`.

This will ensure that collapsed nodes are not present in the DOM, improving rendering performance for large datasets.

## Timeline

- 2026-01-12T05:00:55Z @tobiu added the `enhancement` label
- 2026-01-12T05:00:55Z @tobiu added the `ai` label
- 2026-01-12T05:00:55Z @tobiu added the `refactoring` label
- 2026-01-12T05:00:55Z @tobiu added the `performance` label
- 2026-01-12T06:02:09Z @tobiu referenced in commit `cc6344d` - "refactor: Optimize Neo.tree.List rendering and sticky header behavior (#8577)

- Switch from CSS-based hiding to  for collapsed branches
- Optimize sticky header logic:
  - Disable sticky positioning for collapsed folders
  - Correct  calculation in  (51px vs 48px)
  - Ensure correct layering with
  - Limit  class to only the visible/active header per level
- Dynamically update sticky styles in
- Remove obsolete SCSS rules"
### @tobiu - 2026-01-12T06:02:25Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the refactoring of `Neo.tree.List` to improve performance and sticky header behavior.
> 
> **Key Changes:**
> 1.  **Rendering Optimization**: Switched from CSS-based hiding (`display: none`) to VDOM-based removal (`removeDom: true`) for collapsed branches. This significantly reduces the size of the live DOM for large trees.
> 2.  **Sticky Header Fixes**:
>     *   Disabled sticky positioning for **collapsed** folders. They now scroll away naturally, preventing the "stacking" of closed headers at the top of the list.
>     *   Corrected the scroll tracking logic (`onScrollCapture`) to account for the actual item height (51px vs 48px) and to skip removed DOM nodes. This fixes the drift where headers would get the `.neo-stuck` class too early or too late.
>     *   Refined `.neo-stuck` application: Only the **last** stuck item for a given level gets the class, ensuring that only the visible header (the one on top) receives the background styling.
> 3.  **Layering Improvements**:
>     *   Implemented unconditional Z-Index logic (`10000 + level`) to ensuring deeper headers (e.g., Level 1) correctly overlay parent headers (Level 0).
> 4.  **Dynamic Updates**:
>     *   Updated `onItemClick` to dynamically toggle `position: sticky` and `top` styles when a folder is expanded or collapsed, ensuring the behavior stays consistent without requiring a full re-render.
> 
> These changes solve the "All Folders Open" visual bug, the "Stacking Closed Headers" issue, and the "Incorrect/Multiple Stuck Headers" visual glitch.

- 2026-01-12T06:02:56Z @tobiu assigned to @tobiu
- 2026-01-12T06:03:16Z @tobiu closed this issue

