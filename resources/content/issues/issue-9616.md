---
id: 9616
title: 'Grid Multi-Body: Implement Two-Tier Horizontal Cell Pooling and Scroll Sync'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T20:22:28Z'
updatedAt: '2026-03-31T20:23:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9616'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Implement Two-Tier Horizontal Cell Pooling and Scroll Sync

### Goal
Implement a performant Two-Tier Horizontal Synchronization architecture for the Multi-Body Grid to support App Worker-side cell buffering and pooling while maintaining zero-jitter visual updates on the Main Thread.

### Context
This is a sub-issue for Epic #9486.
The current horizontal scroll implementation delegates visuals to the Main Thread but fails to update the App Worker with the necessary scroll deltas to recalculate `mountedColumns`. 
Without propagating `scrollLeft` to the App Worker, horizontal cell pooling (recycling columns) cannot function correctly.

### Implementation Plan
1. **Main Thread Addon (Visual Sync):** Refactor `GridHorizontalScrollSync` to manually patch the live DOM `left` positions of center body cells and the center toolbar in the same rAF loop.
2. **App Worker Sync (Data Virtualization):** Add `domListeners` to the `HorizontalScrollbar` to route native scroll events to `ScrollManager`, which will update the respective `GridBody` components with the new `scrollLeft`.
3. **VDOM Alignment:** Inject `data-x` into the `Row` cell configurations. The App Worker will bake in the horizontal offset (`columnPosition.x - scrollLeft`) to perfectly align its new VDOM structure with the live-patched Main Thread cells, preventing rollback jitter.
4. **Pinning Fix:** Update `GridRowScrollPinning` to apply `translateY` identically across all active multi-body sections (start/center/end) during vertical scrolling.

## Timeline

- 2026-03-31T20:22:29Z @tobiu added the `enhancement` label
- 2026-03-31T20:22:29Z @tobiu added the `ai` label
- 2026-03-31T20:22:30Z @tobiu added the `grid` label
- 2026-03-31T20:22:36Z @tobiu added parent issue #9486
- 2026-03-31T20:23:36Z @tobiu assigned to @tobiu

