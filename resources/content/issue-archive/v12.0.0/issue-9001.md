---
id: 9001
title: Update Grid Row Cell Border Logic for Pooling
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-05T11:04:47Z'
updatedAt: '2026-02-05T11:10:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9001'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T11:10:05Z'
---
# Update Grid Row Cell Border Logic for Pooling

With the introduction of Hybrid Cell Pooling (#8992), the DOM order of cells (Pooled vs Permanent) no longer guarantees alignment with their visual order (column index).
Consequently, the CSS rule `&:last-child` on `.neo-grid-cell` incorrectly targets the last *rendered* DOM node (which might be a pooled cell in the middle of the grid, or a permanent cell rendered last) instead of the visually last column. This results in incorrect right-borders.

**Solution:**
1.  Update `Neo.grid.Row` to calculate which column is the *last visible column* and apply a specific CSS class (e.g., `neo-last-column`) to its corresponding cell.
2.  Update `resources/scss/src/grid/Body.scss` to use `.neo-last-column` instead of `&:last-child` for removing the right border.

**Note:** This logic must account for both pooled and permanent cells.

## Timeline

- 2026-02-05T11:04:48Z @tobiu added the `bug` label
- 2026-02-05T11:04:48Z @tobiu added the `ai` label
- 2026-02-05T11:04:48Z @tobiu added the `regression` label
- 2026-02-05T11:05:13Z @tobiu assigned to @tobiu
- 2026-02-05T11:09:22Z @tobiu referenced in commit `fe851d4` - "fix: Update Grid Row Cell Border Logic for Pooling (#9001)"
### @tobiu - 2026-02-05T11:09:37Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for the grid row cell border logic.
> 
> **Changes:**
> 1.  **Updated `Neo.grid.Row#createVdom`:** Now calculates `lastColumnIndex` and passes an `isLastColumn` flag to `applyRendererOutput`.
> 2.  **Updated `Neo.grid.Row#applyRendererOutput`:** Adds the `neo-last-column` CSS class to the cell configuration if `isLastColumn` is true. Updated JSDoc to match signature.
> 3.  **Updated `resources/scss/src/grid/Body.scss`:** Replaced the `:last-child` selector with `.neo-last-column` for removing the right border.
> 
> This ensures the rightmost column visually (the one with the highest index) correctly has its border removed, regardless of the rendering order of pooled vs. permanent cells.

- 2026-02-05T11:10:05Z @tobiu closed this issue

