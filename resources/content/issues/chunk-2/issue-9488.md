---
id: 9488
title: 'Grid Multi-Body: SubGrid Row Pooling & Vertical Sync Refactoring'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:15:38Z'
updatedAt: '2026-03-31T13:16:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9488'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T13:16:55Z'
---
# Grid Multi-Body: SubGrid Row Pooling & Vertical Sync Refactoring

Phase 3 of the Multi-Body Epic (#9486).

Currently, `Neo.grid.Body` assumes it is the sole render target for the grid, handling its own full `store` range calculations and `scrollManager` events.

In the Multi-Body architecture, the `Body` component must become a "SubGrid". 

**Requirements:**

**1. Vertical Sync Overhaul:** 
  * The actual vertical `scrollTop` value comes from the outer wrapper (`neo-grid-body-wrapper`). 
  * The `ScrollManager` must be updated to listen to this wrapper, not the individual bodies.
  * When a vertical scroll occurs, the `ScrollManager` (or a central `BodyManager` inside `Container`) must calculate the `startIndex` and `endIndex` of the visible rows *once*.

**2. Synchronized Rendering (`createViewData`):**
  * The three SubGrids (`start`, `center`, `end`) must **not** calculate their own `startIndex`/`endIndex`.
  * They must receive the exact same index range from the orchestrator.
  * All active SubGrids must execute their row pooling loops synchronously, mapping the same `recordId` to the same physical pool index, ensuring they receive the identical `translateY` offset to stay vertically aligned.

**3. Component Refactoring (Isolated Pooling):**
  * Strip out the logic in `grid.Body` that currently assumes it owns the vertical scrollbar.
  * Expose setter methods or configs that allow the parent `Container` to drive the `createViewData` cycle externally for all active bodies simultaneously.
  * Each SubGrid must manage its *own* pool of `Row` instances based exclusively on its specific column collection (Left, Center, or Right).

## Timeline

- 2026-03-16T18:15:39Z @tobiu added the `enhancement` label
- 2026-03-16T18:15:40Z @tobiu added the `ai` label
- 2026-03-16T18:15:40Z @tobiu added the `grid` label
- 2026-03-16T18:15:58Z @tobiu added parent issue #9486
- 2026-03-17T18:59:00Z @tobiu assigned to @tobiu
- 2026-03-31T13:16:32Z @tobiu referenced in commit `286a8db` - "fix: Finalize Grid Multi-Body Row Pooling & Vertical Sync (#9488)"
### @tobiu - 2026-03-31T13:16:54Z

Resolved: Finalized Grid Multi-Body Row Pooling & Vertical Sync. The ScrollManager now uses the centralized body wrapper for vertical scrolling, preventing desync across multiple split bodies. GridRowScrollPinning logic was also updated to listen to the new wrapper.

- 2026-03-31T13:16:55Z @tobiu closed this issue

