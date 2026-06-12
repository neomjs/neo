---
id: 8911
title: Enable Mouse Drag Scrolling in Grid ScrollManager
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-30T10:49:46Z'
updatedAt: '2026-01-30T11:33:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8911'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T11:32:02Z'
---
# Enable Mouse Drag Scrolling in Grid ScrollManager

Enhance `Neo.grid.ScrollManager` to support mouse-based drag-to-scroll on desktop, improving DX for users without horizontal scroll wheels.

**Requirements:**
1.  Add `mousedown`, `mousemove`, `mouseup`, and `mouseleave` listeners to `gridBody`.
2.  Implement `onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeave` handlers in `ScrollManager`.
3.  Calculate `deltaX` and `deltaY` from mouse movements and apply them via `DomAccess.scrollTo`, mirroring the existing touch logic.
4.  Add `mouseDragScroll_` config (default: `true`) to toggle this feature.
5.  Ensure native text selection is prevented during drag (`preventDefault`) to give a "Hand Tool" feel.
6.  Important: `mousemove` listener must be registered with `local: true` to avoid flooding the worker bridge.

**Architecture:**
This implementation remains isolated within `ScrollManager` and does not require enabling the global `Touch` sensor on desktop, avoiding conflicts with the main `DragDrop` system.

## Timeline

- 2026-01-30T10:49:46Z @tobiu added the `ai` label
- 2026-01-30T10:49:46Z @tobiu added the `feature` label
- 2026-01-30T11:31:48Z @tobiu assigned to @tobiu
- 2026-01-30T11:32:02Z @tobiu closed this issue
- 2026-01-30T11:32:33Z @tobiu referenced in commit `47894ff` - "feat: Enable Mouse Drag Scrolling in Grid ScrollManager (#8911)"
### @tobiu - 2026-01-30T11:33:44Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the mouse drag scrolling enhancements in `src/grid/ScrollManager.mjs`.
> 
> **Changes:**
> 1.  **Mouse Listener Support:** Added `mousedown`, `mousemove` (local), `mouseup`, and `mouseleave` listeners to `gridBody` in `construct`.
> 2.  **Unified Delta Logic:** Implemented `onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeave` to handle drag-to-scroll logic, mirroring the touch implementation but isolated for mouse events.
> 3.  **Config:** Added `mouseDragScroll_` (default `true`) to toggle the feature.
>     -   Added `afterSetMouseDragScroll` to toggle the `neo-mouse-drag-scroll` class on the body.
>     -   Updated `resources/scss/src/grid/Body.scss` to disable `user-select` when this class is present.
> 4.  **Touch Conflict Resolution:** Added logic in `construct` to automatically set `mouseDragScroll = false` if `Neo.config.hasTouchEvents` is detected, preventing conflicts on hybrid devices.
> 5.  **State:** Added `isMouseDragging`, `lastMouseX`, `lastMouseY` to track drag state.
> 
> This implementation allows users to scroll the grid by dragging with the mouse, improving DX for users without horizontal scrolling hardware.
> 
> Closing the ticket.


