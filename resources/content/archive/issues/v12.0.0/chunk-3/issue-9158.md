---
id: 9158
title: 'docs: Document Grid Performance Optimizations (Row/Cell Recycling)'
state: CLOSED
labels:
  - documentation
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T00:32:28Z'
updatedAt: '2026-02-15T00:35:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9158'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T00:35:09Z'
---
# docs: Document Grid Performance Optimizations (Row/Cell Recycling)

The recent performance optimizations for the Grid (#9156 and #9157) introduced significant logic changes to `Neo.grid.Body` and `Neo.grid.Row`.
These changes need to be reflected in the JSDoc to ensure future maintainability and understanding of the "Row Skipping" and "Cell Recycling" strategies.

**Changes:**
1.  **Neo.grid.Body.createViewData**: Document the `force` parameter and the auto-detection logic for horizontal scrolling/resizing. Explain the three optimization strategies (Row Skipping, Cell Recycling, Forced Updates).
2.  **Neo.grid.Row.createVdom**: Document the "Cell Recycling" strategy, specifically how the `recycle` flag and `oldCn` Map lookup work to prevent redundant cell re-rendering during horizontal scrolling.
3.  **Neo.grid.Row.updateContent**: Ensure the params `force` and `recycle` are well-documented. (Already done in implementation, but good to double-check consistency).

## Timeline

- 2026-02-15T00:32:29Z @tobiu added the `documentation` label
- 2026-02-15T00:32:29Z @tobiu added the `ai` label
- 2026-02-15T00:32:29Z @tobiu added the `performance` label
- 2026-02-15T00:34:24Z @tobiu referenced in commit `044adec` - "docs: Document Grid Performance Optimizations (Row/Cell Recycling) (#9158)"
- 2026-02-15T00:34:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T00:34:38Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the JSDoc for `Neo.grid.Body.createViewData` and `Neo.grid.Row.createVdom` to accurately reflect the new optimization strategies.
> 
> **Documentation Enhancements:**
> 1.  **Row Skipping:** Documented how `createViewData` and `Row.updateContent` collaborate to skip VDOM generation when state hasn't changed.
> 2.  **Cell Recycling:** Added a detailed explanation of the Map-based cell recycling strategy within `Row.createVdom`. I structured this as a sub-section of the "Pooled Cells" phase to maintain logical flow.
> 3.  **Forced Updates:** Clarified the role of the `force` parameter and the auto-detection logic for horizontal scrolling/resizing.
> 
> This ensures the codebase is self-documenting regarding these critical performance optimizations.

- 2026-02-15T00:35:09Z @tobiu closed this issue

