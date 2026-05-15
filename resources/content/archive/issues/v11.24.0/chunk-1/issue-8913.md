---
id: 8913
title: Main Thread Addon for High-Performance Grid Drag Scrolling
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-30T11:51:55Z'
updatedAt: '2026-01-30T12:52:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8913'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T12:52:50Z'
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
- 2026-01-30T12:51:44Z @tobiu referenced in commit `4827ba4` - "feat: Implement Main Thread Addon for High-Performance Grid Drag Scrolling (#8913)"
- 2026-01-30T12:51:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T12:52:08Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the `Neo.main.addon.GridDragScroll` addon to move grid drag-scrolling logic to the Main Thread.
> 
> ### Implementation Details
> 
> **1. Main Thread Addon (`src/main/addon/GridDragScroll.mjs`)**
> *   **Purpose:** Handles the drag-to-scroll interaction directly in the UI thread to eliminate worker messaging latency.
> *   **Event Handling:**
>     *   Listens for `mousedown` on the grid body with `{capture: true}` to intercept drag starts even if children stop propagation.
>     *   Attaches `mousemove` and `mouseup` listeners to `document` (with `{capture: true}`) during an active drag. This supports "over-drag," allowing the user to drag outside the grid/window bounds without losing the scroll operation.
>     *   Respects the `neo-draggable` exclusion check to avoid conflicting with other drag operations.
> *   **Direct DOM Manipulation:** Updates `scrollLeft` and `scrollTop` directly on the registered container and body elements for maximum performance.
> 
> **2. ScrollManager Refactor (`src/grid/ScrollManager.mjs`)**
> *   **Lifecycle Awareness:** Introduced a `mounted_` reactive config.
> *   **Dynamic Registration:**
>     *   Registers with the addon only when `mouseDragScroll` is true AND the grid is `mounted`.
>     *   Unregisters when `mouseDragScroll` is disabled or the grid is unmounted.
>     *   Targets the `${bodyId}__wrapper` element to ensure vertical scrolling applies to the correct scroll container.
> *   **Cleanup:** Removed the legacy App Worker-side mouse event listeners (`mousedown`, `mousemove`, `mouseup`) and their handlers.
> 
> **3. Grid Container Integration (`src/grid/Container.mjs`)**
> *   Updated `afterSetMounted` to propagate the `mounted` state to the `scrollManager`. This ensures the `ScrollManager` knows when the DOM is ready for addon registration.
> 
> ### Outcome
> This architecture change resolves the performance bottleneck caused by cross-thread `mousemove` events. Scrolling via mouse drag on desktop is now as smooth and responsive as native touch scrolling.

- 2026-01-30T12:52:50Z @tobiu closed this issue

