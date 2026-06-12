---
id: 9614
title: 'Grid Multi-Body: Fix Horizontal Row Clipping & Scrollbar SCSS'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T15:56:50Z'
updatedAt: '2026-04-01T21:43:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9614'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T21:42:24Z'
---
# Grid Multi-Body: Fix Horizontal Row Clipping & Scrollbar SCSS

### Problem
In the new Multi-Body Grid architecture, horizontal scrolling is currently broken due to cell clipping.
1. `.neo-grid-row` applies `contain: strict` and inherits the viewport width. Cells positioned with absolute `left` values beyond the viewport width are physically culled (clipped) by the browser. 
2. The decoupled `HorizontalScrollbar` is currently invisible. It lacks proper dimensions and SCSS styling. 
3. The horizontal sync relies on the `HorizontalScrollbar` which isn't updating its inner content scaling dynamically to match the actual virtual width of columns in the Center SubGrid.

### Solution
1. Remove generic `width: 100%` and apply the true virtual width of all active columns to `.neo-grid-body-content`. This ensures `.neo-grid-row` fully encompasses all cells, allowing them to render without triggering the `contain: strict` culling.
2. Introduce `resources/scss/src/grid/HorizontalScrollbar.scss` to natively define `overflow-x: auto; flex: none;`.
3. Update `Container.mjs` and `Body.mjs` to feed the exact `virtualWidth` calculated by the `HeaderToolbar` into `horizontalScrollbar.contentWidth`, properly scaling the track thumb.

## Timeline

- 2026-03-31T15:56:51Z @tobiu added the `enhancement` label
- 2026-03-31T15:56:51Z @tobiu added the `ai` label
- 2026-03-31T15:56:52Z @tobiu added the `grid` label
- 2026-04-01T08:29:21Z @tobiu assigned to @tobiu
- 2026-04-01T21:42:18Z @tobiu added parent issue #9486
- 2026-04-01T21:42:24Z @tobiu closed this issue
### @tobiu - 2026-04-01T21:43:06Z

already resolved.


