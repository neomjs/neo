---
id: 8164
title: Enhance Neo.manager.Window to Track Full Window Geometry
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-27T21:30:52Z'
updatedAt: '2025-12-27T23:53:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8164'
author: tobiu
commentsCount: 1
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-27T23:53:28Z'
---
# Enhance Neo.manager.Window to Track Full Window Geometry

During the implementation of cross-window drag & drop, we discovered that `Neo.manager.Window` primarily tracked the outer window `rect` (screen coordinates of the frame). To correctly position elements inside the viewport (like the drag proxy), we patched it to calculate `headerHeight` (`outerHeight - innerHeight`).

**Issue:**
The current `Window` model is incomplete. It confounds "Screen Position" (Frame) with "Content Position" (Viewport). This leads to ad-hoc calculations in consumers like `DragCoordinator` to infer the browser chrome size.

**Goal:**
Refactor `Neo.manager.Window` to explicitly track and expose:
1.  `outerRect`: The window frame on the OS screen.
2.  `innerRect` (or `viewportRect`): The content area on the OS screen.
3.  `chromeDimensions`: Top/Left/Right/Bottom border sizes.

**Benefits:**
*   Simplifies cross-window positioning (popups, proxies, infinite canvas).
*   Enables precise "center on parent content" logic.
*   Removes fragile `headerHeight` assumptions.

## Timeline

- 2025-12-27T21:30:53Z @tobiu added the `enhancement` label
- 2025-12-27T21:30:53Z @tobiu added the `ai` label
- 2025-12-27T21:30:54Z @tobiu added the `architecture` label
- 2025-12-27T21:33:46Z @tobiu added parent issue #8163
- 2025-12-27T23:00:48Z @tobiu assigned to @tobiu
- 2025-12-27T23:52:22Z @tobiu referenced in commit `146980c` - "Neo.manager.Window: Implement full window geometry tracking with Cross-Browser Viewport Support - #8164

- Implemented Window.calculateGeometry to robustly determine viewport coordinates.
- Added support for Firefox (mozInnerScreenX) and Safari (Frame + Chrome calculation) via cached isSafari config.
- Updated Main.mjs to report raw sensor data (mozInnerScreenX/Y).
- Reverted WindowPosition.mjs to keep logic centralized in the App Worker.
- Updated DragCoordinator to use precise innerRect.
- Added JSDoc to onWindowConnect clarifying data source."
### @tobiu - 2025-12-27T23:53:00Z

**Input from gemini:**

> ✦ I have implemented the enhanced window geometry tracking to support the "Infinite Canvas" across different browsers.
> 
> **Key Changes:**
> 
> 1.  **Refactored `Neo.manager.Window`:**
>     *   Added `calculateGeometry` to interpret raw window data and derive `innerRect` (viewport), `outerRect` (frame), and `chrome` dimensions.
>     *   Implemented browser-specific logic:
>         *   **Firefox:** Uses `mozInnerScreenX/Y` directly for precise viewport positioning.
>         *   **Safari:** Uses `isSafari` flag (cached via `navigator.userAgent`) to correct for the frame-based `screenLeft/Top` coordinates by adding calculated chrome.
>         *   **Chrome/Edge:** Uses `screenLeft/Top` as the viewport origin (standard behavior).
>     *   Updated `onWindowConnect` and `onWindowPositionChange` to use this robust logic.
> 
> 2.  **Updated `Neo.manager.DragCoordinator`:**
>     *   Switched from manual, brittle coordinate calculations to using the new `targetWindow.innerRect`. This ensures drop targets are detected exactly where the user sees them, regardless of browser chrome size.
> 
> 3.  **Updated `Neo.Main`:**
>     *   Modified `getWindowData` to report raw sensor data, including `mozInnerScreenX/Y`. It now acts as a dumb sensor, delegating interpretation to the Worker.
> 
> 4.  **Reverted `Neo.main.addon.WindowPosition`:**
>     *   Restored to its simpler state of tracking raw `screenLeft/Top` for movement detection, maintaining clean separation of concerns.
> 
> This foundation allows precise cross-window coordinate mapping for all major browsers.

- 2025-12-27T23:53:29Z @tobiu closed this issue

