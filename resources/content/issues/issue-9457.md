---
id: 9457
title: 'Grid: Implement Mathematical Column Layout Engine'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:26:32Z'
updatedAt: '2026-03-16T11:00:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9457'
author: tobiu
commentsCount: 1
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T11:00:10Z'
---
# Grid: Implement Mathematical Column Layout Engine

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
Currently, `grid.header.Toolbar#passSizeToBody` calculates column `x` positions by calling `getDomRect` on the header items.
This poses a problem for locked columns using CSS transforms (`transform: translateX`). `getDomRect` will return the *visually transformed* layout coordinates, breaking the logical representation of the Grid's layout state.

**Task:**
Refactor the column layout calculation in `GridContainer` / `HeaderToolbar` so that `columnPositions.x` is calculated mathematically.
* `Logical X` should equal the sum of the widths (including borders/margins) of all preceding columns in the `items` array.
* This entirely decouples logical `x` layout from visual CSS states and avoids the need for asynchronous `getDomRect` queries on individual header buttons, improving startup performance.

*Note: The `Container` width and `Toolbar` height/width still need to be measured once for container sizing.*

## Timeline

- 2026-03-13T10:26:50Z @tobiu added parent issue #9456
- 2026-03-13T10:26:52Z @tobiu added the `enhancement` label
- 2026-03-13T10:26:52Z @tobiu added the `grid` label
- 2026-03-13T10:26:52Z @tobiu added the `ai` label
- 2026-03-13T10:26:59Z @tobiu assigned to @tobiu
- 2026-03-16T10:53:50Z @tobiu referenced in commit `9e67aca` - "Grid: Implement Mathematical Column Layout Engine (#9457)"
### @tobiu - 2026-03-16T10:54:06Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the initial implementation for this sub-task (#9457).
> 
> **Changes Implemented:**
> 1. **Mathematical Ordering**: Refactored `src/grid/Container.mjs -> createColumns()` to intercept the `columns` configuration upon grid initialization. It physically sorts the column definitions based on their `locked` configuration (`start` -> `unlocked` -> `end`) *before* VDOM generation and `header.Toolbar` item creation. This guarantees that DOM structures inherently respect the locked ordering.
> 2. **Hybrid Layout Engine**: Refactored `src/grid/header/Toolbar.mjs -> passSizeToBody()`. 
>    - It now calculates logical X coordinates mathematically using `currentX += width` (ensuring coordinates aren't corrupted by CSS transforms used in pinning).
>    - **Optimization**: It detects if any columns use dynamic sizing (`flex` or non-pixel values). If all columns are fixed-width, it bypasses the `getDomRect` layout check entirely for a faster, DOM-free render phase. If dynamic columns are present, it falls back to measuring the layout to calculate `currentX`.
> 
> This change lays the required mathematical foundation for the main thread pinning addon, as logical widths and X-coordinates are now correctly and efficiently parsed.

- 2026-03-16T11:00:10Z @tobiu closed this issue
- 2026-03-16T12:25:57Z @tobiu cross-referenced by #9456

