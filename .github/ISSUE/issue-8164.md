---
id: 8164
title: Enhance Neo.manager.Window to Track Full Window Geometry
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-27T21:30:52Z'
updatedAt: '2025-12-27T21:30:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8164'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-27 @tobiu added the `enhancement` label
- 2025-12-27 @tobiu added the `ai` label
- 2025-12-27 @tobiu added the `architecture` label
- 2025-12-27 @tobiu added parent issue #8163

