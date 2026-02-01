---
id: 8935
title: 'Feat: Yearly Breakdown Columns & Heatmap'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T15:59:25Z'
updatedAt: '2026-02-01T16:11:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8935'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T16:11:25Z'
---
# Feat: Yearly Breakdown Columns & Heatmap

This task focuses on leveraging the Neo.mjs Grid's horizontal scrolling capabilities by adding yearly contribution columns (2025 down to 2010). This will visualize the "career arc" of contributors.

### Requirements
1.  **Model Update:** Update `DevRank.model.Contributor` to expose yearly data as top-level fields (e.g., `y2025`, `y2024`) mapping from the nested `years` object.
2.  **Grid Columns:**
    - Dynamically generate columns for the range 2025 down to 2010.
    - Place these columns after the "Updated" column.
    - **Header:** The Year (e.g., "2025").
    - **Cell Content:** The contribution count.
    - **Heatmap Styling:** Apply a CSS class or inline style to the cell background based on the value intensity:
        - 0: No color
        - 1-100: Low intensity
        - 100-1000: Medium intensity
        - 1000+: High intensity

### Acceptance Criteria
- The grid displays ~16 new columns for yearly data.
- Horizontal scrolling works smoothly.
- Cells are color-coded based on contribution volume.


## Timeline

- 2026-02-01T15:59:27Z @tobiu added the `enhancement` label
- 2026-02-01T15:59:27Z @tobiu added the `design` label
- 2026-02-01T15:59:36Z @tobiu added parent issue #8930
- 2026-02-01T16:00:08Z @tobiu assigned to @tobiu
- 2026-02-01T16:03:54Z @tobiu referenced in commit `dbd237b` - "feat: Yearly Breakdown Columns & Heatmap (#8935)"
- 2026-02-01T16:10:22Z @tobiu referenced in commit `71466c5` - "fix: Resolve maximum call stack error in GridContainer (#8935)"
### @tobiu - 2026-02-01T16:10:36Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the `Maximum call stack size exceeded` error.
> 
> ### Issue
> The error was caused by a naming collision or recursion loop when using the method name `createColumns` while extending `Neo.grid.Container`. It's likely that the base class or its config system interacts with a method of this name, or the `columns` setter triggered a cycle.
> 
> ### Fix
> 1.  Renamed `createColumns` to `buildDynamicColumns` to ensure a unique method name.
> 2.  Verified that `buildDynamicColumns` is called within `construct` after `super.construct`.
> 3.  Ensured the static `columns` config was removed (it was already overwritten in the previous file write, but verified).
> 
> The grid should now render correctly without infinite recursion.

- 2026-02-01T16:11:25Z @tobiu closed this issue

