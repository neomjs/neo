---
id: 9459
title: 'Grid: Implement Reactive locked Config and Cell Pooling Bypass'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:27:58Z'
updatedAt: '2026-03-13T10:28:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9459'
author: tobiu
commentsCount: 0
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid: Implement Reactive locked Config and Cell Pooling Bypass

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
Locked columns must be excluded from standard virtualized Cell Pooling (`hideMode: 'removeDom'`). If a locked column scrolls out of the `mountedColumns` viewport range, its pooled DOM node would typically be hijacked for a new incoming column, causing the locked column to disappear.

**Task:**
1. Replace the legacy `dock` config with a reactive `locked_: null` ('start' | 'end') configuration in `src/grid/column/Base.mjs`.
2. Refactor `src/grid/Row.mjs` rendering passes:
   - **Pass 1 (Pooled Cells):** Exclude any column where `locked` is truthy.
   - **Pass 2 (Permanent Cells):** Force any column where `locked` is truthy to render here. This guarantees the column remains in the DOM regardless of horizontal scroll state.
   - Apply specific CSS classes `.neo-locked-start` and `.neo-locked-end` to these cells.
3. Add corresponding SCSS rules utilizing the CSS variables driven by the Main Thread Addon (Epic Sub-Task 2):
   ```scss
   .neo-locked-start {
       z-index: 5;
       transform: translateX(var(--grid-locked-start-offset, 0px));
   }
   .neo-locked-end {
       z-index: 5;
       transform: translateX(var(--grid-locked-end-offset, 0px));
   }
   ```
4. Adjust `VerticalScrollbar.scss` to `z-index: 10` so it floats above `neo-locked-end` columns.

## Timeline

- 2026-03-13T10:28:06Z @tobiu added parent issue #9456
- 2026-03-13T10:28:07Z @tobiu added the `enhancement` label
- 2026-03-13T10:28:07Z @tobiu added the `grid` label
- 2026-03-13T10:28:07Z @tobiu added the `ai` label
- 2026-03-13T10:28:18Z @tobiu assigned to @tobiu

