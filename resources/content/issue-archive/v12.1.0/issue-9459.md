---
id: 9459
title: 'Grid: Implement Reactive locked Config and Cell Pooling Bypass'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:27:58Z'
updatedAt: '2026-03-16T12:07:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9459'
author: tobiu
commentsCount: 1
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T12:07:47Z'
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
- 2026-03-16T12:02:05Z @tobiu referenced in commit `e432044` - "Grid: Implement Cell Pooling Bypass & SCSS Rules for Locked Columns (#9459)"
### @tobiu - 2026-03-16T12:02:19Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the implementation for this sub-task (#9459).
> 
> **Implementation Details:**
> 
> 1. **Cell Pooling Bypass (`src/grid/Row.mjs`)**:
>    - **Pass 1 (Pooled Cells):** Updated to explicitly exclude columns where `locked` is truthy (`!column.locked`).
>    - **Pass 2 (Permanent Cells):** Updated to include all `column.locked` columns regardless of their `hideMode`. This physically guarantees the DOM nodes for locked columns are never destroyed or recycled when scrolling horizontally, enabling stable CSS transforms.
>    - Removed the legacy `column.dock` fallback logic since `applyRendererOutput` now dynamically adds the correct `.neo-locked-start` and `.neo-locked-end` classes.
> 
> 2. **Hardware-Accelerated Pinning SCSS**:
>    - Added `.neo-locked-start` and `.neo-locked-end` classes to `resources/scss/src/grid/Body.scss` and `resources/scss/src/grid/header/Button.scss`.
>    - Used `transform: translateX(var(...))` tied to the CSS variables updated by the Main Thread Addon. This cleanly separates mathematical logical coordinates (`left`) managed by the VDOM from visual composite shifting (`transform`) managed by the browser compositor, completely avoiding layer explosions or hot main-thread layouts.
>    - Applied `z-index: 5` to the locked columns.
> 
> 3. **Scrollbar Adjustment**:
>    - Modified `resources/scss/src/grid/VerticalScrollbar.scss` to use `z-index: 10`, ensuring the scrollbar always floats correctly above pinned columns at the end of the grid.

- 2026-03-16T12:07:47Z @tobiu closed this issue
- 2026-03-16T12:25:57Z @tobiu cross-referenced by #9456

