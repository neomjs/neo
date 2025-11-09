---
id: 7204
title: 'Phase 3: Dynamic Proxy Transitioning (Windowing)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-20T22:06:01Z'
updatedAt: '2025-10-24T10:08:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7204'
author: tobiu
commentsCount: 1
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-24T10:08:16Z'
---
# Phase 3: Dynamic Proxy Transitioning (Windowing)

**Reported by:** @tobiu on 2025-08-20

---

**Parent Issue:** #7201 - Dashboard Drag & Drop

---

This phase builds directly on the live proxy from Phase 2, introducing a seamless transition between an in-page proxy and a separate browser window, based on the drag location. This will adapt the existing "detach widget" logic found in `Colors.view.ViewportController`.

1.  **API Integration & Boundary Detection:**
    -   Integrate the Window Management API for window placement control.
    -   During a `drag:move` operation, use `Neo.util.Rectangle.getIntersection()` to continuously calculate the overlap between the live proxy's bounds and the viewport's bounds.

2.  **Seamless Proxy-to-Window Transition:**
    -   If the proxy is dragged more than 50% outside the viewport, trigger a transition:
        - The drag operation will continue without interruption.
        - **Adapt the logic from `ViewportController.createBrowserWindow()`:** A new popup window will be created at the proxy's current screen coordinates.
        - The live component will be moved from the in-page proxy into the new popup, reusing the existing child app and connection logic (`onAppConnect`).
        - The in-page proxy will be destroyed, and the drag operation will now move the popup window using `popup.moveTo()`.

3.  **Seamless Window-to-Proxy Transition ("Docking"):**
    -   If a dragged popup window is moved back to overlap the viewport by more than 50%, it will automatically transition back:
        - The drag operation will continue without interruption.
        - **Adapt the logic from `ViewportController.onAppDisconnect()`:** Instead of just re-inserting the widget into the layout, it will be moved into a new live in-page proxy created at the window's current position.
        - The popup window will be closed.
        - The drag operation will revert to moving the in-page proxy, allowing for re-sorting within the viewport.

## Comments

### @tobiu - 2025-10-24 10:08

resolved.

