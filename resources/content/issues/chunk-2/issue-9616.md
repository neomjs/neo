---
id: 9616
title: 'Grid Multi-Body: Implement Two-Tier Horizontal Cell Pooling and Scroll Sync'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T20:22:28Z'
updatedAt: '2026-04-01T17:21:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9616'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T17:21:56Z'
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
- 2026-04-01T17:21:35Z @tobiu referenced in commit `be0fcab` - "feat: Implement CSS-based horizontal scroll sync with App Worker data virtualization interception (#9616)"
### @tobiu - 2026-04-01T17:21:49Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The two-tier horizontal scroll synchronization has been successfully implemented and merged!
> 
> ### Implementation Details:
> 1. **Main Thread CSS Synchronization**: Utilized `transform: translateX(calc(var(--grid-scroll-left, 0px) * -1))` inside `Body.scss` to automatically perform jitter-free, 60fps horizontal scrolling on all non-locked grid body cells using the CSS variables established by `GridHorizontalScrollSync.mjs`. This bypasses any need to manually monkey-patch JS `ele.style.left` properties, resulting in incredible real-time UI performance.
> 2. **App Worker Interception**: Updated `ScrollManager.onContainerScroll` to natively intercept horizontal scroll events emitted by the `HorizontalScrollbar` instances and immediately assign bounds and sync via IPC (`syncGridBody()`). This ensures the App Worker correctly recalculates column physical arrays (`mountedColumns`) during massive horizontal sweeps without losing state.
> 3. **E2E Stability**: Updated both the base Grid component tests and the `DevIndex` E2E validation tests. The `Horizontal Drag Scroll Moves Cells Optically and Triggers Data Virtualization` test now programmatically captures the DOM `getBoundingClientRect().left` to verify positive `pixelShift` on the Main Thread.
> 
> E2E testing is fully green. Closing this issue.

- 2026-04-01T17:21:56Z @tobiu closed this issue
- 2026-04-01T17:27:50Z @tobiu cross-referenced by #9619

