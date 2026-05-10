---
id: 9397
title: 'R&D: Explore "Fixed Glass Overlay" Strategy for Optical Pinning'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T18:12:15Z'
updatedAt: '2026-03-08T18:12:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9397'
author: tobiu
commentsCount: 0
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# R&D: Explore "Fixed Glass Overlay" Strategy for Optical Pinning

This R&D ticket explores the **"Fixed Glass Overlay"** strategy to completely cure the "White Flash" rendering artifact during massive manual scrollbar drags in async virtualization environments.

**The Underlying Physics Problem:**
Previous explorations (`#9393`, `#9396`) proved that mathematically correct CSS `translateY` transforms applied to the scroll content cannot prevent a white flash during massive scroll jumps (e.g., 50,000px). When the native `scrollTop` changes drastically, the browser's GPU compositor destroys the off-screen texture tile containing the stale rows. Even if we synchronously translate the rows back into the viewport, the browser paints a blank rectangle because the texture buffer was already flushed.

**The "Fixed Glass Overlay" Hypothesis:**
To defeat the browser's texture flushing, we must physically detach the rows from the scrolling context entirely during the drag.
1.  **Intercept Drag:** When `GridRowScrollPinning` detects a scrollbar thumb `mousedown`, it applies a `.neo-is-thumb-dragging` class to the grid wrapper.
2.  **Detach & Lock (CSS):** The SCSS uses this class to force `.neo-grid-row` to `position: fixed !important`. 
3.  **Coordinate Mapping:** Because the rows are now fixed relative to the *browser window*, they instantly detach from the massive 2.5m pixel scrolling layer. They cannot be scrolled off-screen. We use CSS variables to lock their `top` coordinate to exactly where they were physically resting when the drag started.
4.  **The Drag:** As the user drags the scrollbar wildly, the massive scroll layer flies up and down behind the rows, but the rows remain perfectly frozen "on the glass". The GPU compositor cannot flush them because they never move relative to the viewport.
5.  **Heal:** On `mouseup` or when the App Worker sends the new VDOM, the class is removed. The rows revert to `position: absolute` and snap into their new, perfectly calculated layout slots within the scroll layer.

**Implementation Goals:**
- Update `Body.scss` to define the fixed-position override state.
- Update `Row.mjs` to embed its `Y` coordinate as a CSS variable (`--row-initial-y`).
- Update `GridRowScrollPinning` to capture the wrapper's physical bounds on mousedown and manage the class toggling.

## Timeline

- 2026-03-08T18:12:17Z @tobiu added the `enhancement` label
- 2026-03-08T18:12:17Z @tobiu added the `ai` label
- 2026-03-08T18:12:17Z @tobiu added the `architecture` label
- 2026-03-08T18:12:17Z @tobiu added the `grid` label
- 2026-03-08T18:12:27Z @tobiu added parent issue #9380
- 2026-03-08T18:12:41Z @tobiu assigned to @tobiu

