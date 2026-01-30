---
id: 8913
title: Main Thread Addon for High-Performance Grid Drag Scrolling
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-01-30T11:51:55Z'
updatedAt: '2026-01-30T11:51:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8913'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Main Thread Addon for High-Performance Grid Drag Scrolling

To further optimize grid scrolling performance on desktop, particularly for mouse users, we propose moving the mouse-based drag-to-scroll logic entirely to the Main Thread via a specialized addon.

**Problem:**
The current App Worker implementation relies on `mousemove` events crossing the worker boundary. This adds messaging overhead and latency, making the drag-scroll feel "chunky" compared to the smooth, native-feeling touch scroll.

**Proposed Solution:**
Create `Neo.main.addon.GridDragScroll`, a new Main Thread Addon that handles the drag-to-scroll interaction directly in the UI thread.

**Key Features:**
1.  **Direct DOM Manipulation:** Listen to `mousedown`, `mousemove` (global), and `mouseup` (global) in the main thread and update `scrollLeft`/`scrollTop` directly on the grid elements.
2.  **Zero Worker Traffic:** Eliminates high-frequency `mousemove` messages to the App Worker during scroll operations.
3.  **Dynamic Loading:** The addon should only be loaded/registered when `mouseDragScroll` is enabled and the environment is *not* touch-enabled.
4.  **Global Drag Tracking:** By handling events in the main thread, we can easily attach listeners to `document` or `window` to support "over-drag" (scrolling continues even if the mouse leaves the grid bounds), matching the robust behavior of touch scrolling.

**Implementation Plan:**
1.  Create `src/main/addon/GridDragScroll.mjs`.
2.  Implement `register({id, bodyId, containerId, ...})` to attach listeners.
3.  Implement the drag math (delta tracking) and scroll application.
4.  Update `src/grid/ScrollManager.mjs` to dynamically import and register this addon in `afterSetMouseDragScroll` (if not touch).
5.  Remove the App Worker-side mouse listener logic from `ScrollManager.mjs` once the addon is proven.

**Constraints:**
-   Must respect `Neo.config.hasTouchEvents` to avoid conflict with native touch scrolling.
-   Needs to handle the `mouseDragScroll` config toggle dynamically.
-   Should be destroyed/unregistered properly to prevent leaks.

## Timeline

- 2026-01-30T11:51:57Z @tobiu added the `enhancement` label
- 2026-01-30T11:51:57Z @tobiu added the `ai` label
- 2026-01-30T11:51:57Z @tobiu added the `performance` label

