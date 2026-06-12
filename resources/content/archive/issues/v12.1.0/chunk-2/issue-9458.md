---
id: 9458
title: 'Grid: Create Main Thread Addon for Column Pinning (CSS Variables)'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:27:09Z'
updatedAt: '2026-03-16T11:49:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9458'
author: tobiu
commentsCount: 1
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T11:49:17Z'
---
# Grid: Create Main Thread Addon for Column Pinning (CSS Variables)

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
To achieve 60fps horizontal scrolling without tearing or "catch up" visual artifacts, the pinning of locked columns must be handled synchronously in the Main Thread. Iterating over cell DOM nodes to apply transforms within a scroll loop is too expensive.

**Task:**
1. Create a new Main Thread Addon: `Neo.main.addon.GridColumnScrollPinning`.
2. Implement logic analogous to `GridRowScrollPinning`. It should listen to the horizontal `scroll` event of the Grid Wrapper/Container.
3. Synchronously apply CSS custom properties (variables) to the Grid Wrapper node:
   - `--grid-locked-start-offset: ${scrollLeft}px;`
   - `--grid-locked-end-offset: ${scrollLeft - (scrollWidth - clientWidth)}px;`
4. Register this addon in `src/grid/ScrollManager.mjs`, ensuring it is properly managed during grid lifecycle events (mount/destroy).

*Note: The offset calculation logic cleanly handles scaling without requiring knowledge of the specific column widths or positions.*

## Timeline

- 2026-03-13T10:27:19Z @tobiu added parent issue #9456
- 2026-03-13T10:27:33Z @tobiu added the `enhancement` label
- 2026-03-13T10:27:33Z @tobiu added the `grid` label
- 2026-03-13T10:27:33Z @tobiu added the `ai` label
- 2026-03-13T10:27:45Z @tobiu assigned to @tobiu
- 2026-03-16T11:48:13Z @tobiu referenced in commit `a8dd7ad` - "Grid: Create Main Thread Addon for Column Pinning (#9458)"
### @tobiu - 2026-03-16T11:48:30Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the implementation for this sub-task (#9458). We extended the scope to make the addon registration dynamic, ensuring zero overhead for grids without locked columns.
> 
> **Implementation Details:**
> 
> 1. **`GridColumnScrollPinning` Addon:**
>    - Created `src/main/addon/GridColumnScrollPinning.mjs`.
>    - Listens to horizontal `scroll` events on the Grid Container wrapper node.
>    - Synchronously calculates `startOffset` (`scrollLeft`) and `endOffset` (`scrollLeft - (scrollWidth - clientWidth)`).
>    - Applies these as CSS custom properties (`--grid-locked-start-offset`, `--grid-locked-end-offset`) directly to the container node. Since CSS variables inherit, this single DOM write efficiently provides the translation offsets to all locked header buttons and grid cells.
> 
> 2. **Dynamic Lifecycle (`GridContainer` & `ScrollManager`):**
>    - Added a `hasLockedColumns` getter to `grid.Container.mjs` to dynamically evaluate if any column is currently locked (`'start'` or `'end'`). Removed the `left`/`right` aliases to strictly enforce logical, RTL-ready terminology.
>    - Refactored `grid.ScrollManager.mjs` to dynamically register/unregister the addon via `updateColumnScrollPinningAddon(active)`.
>    - The ScrollManager now actively evaluates `me.mounted && me.gridContainer?.hasLockedColumns` during `afterSetMounted`, `afterSetWindowId`, and when explicitly triggered by the Container's `onColumnLockChange` pipeline.
>    - This architecture guarantees that the scroll listener and math calculations are strictly isolated to grids that actually require pinning, scaling perfectly down to zero cost for standard grids.

- 2026-03-16T11:49:17Z @tobiu closed this issue
- 2026-03-16T12:25:57Z @tobiu cross-referenced by #9456

