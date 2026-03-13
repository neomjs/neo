---
id: 9458
title: 'Grid: Create Main Thread Addon for Column Pinning (CSS Variables)'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:27:09Z'
updatedAt: '2026-03-13T10:27:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9458'
author: tobiu
commentsCount: 0
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

