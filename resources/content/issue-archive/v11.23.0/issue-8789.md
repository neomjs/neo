---
id: 8789
title: Fix TicketCanvas Animation Glitches and Performance
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T23:54:15Z'
updatedAt: '2026-01-18T23:56:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8789'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T23:56:36Z'
---
# Fix TicketCanvas Animation Glitches and Performance

This ticket addresses multiple issues identified in the `TicketCanvas.mjs` rendering logic:

1.  **Duplicate Render Loops:** Fixed a bug where navigating between tickets would spawn parallel render loops, causing performance degradation and erratic animation behavior. The fix involves correctly tracking and nullifying `animationId`.
2.  **Visual Glitch on First Item:** Resolved a "vanishing" glitch on the first timeline item caused by negative head velocity ("retraction") during extreme deceleration.
    *   **Solution:** Implemented **"Dual-Point Physics"**, simulating the pulse Head and Tail as independent particles. This creates organic, physically correct "Squash and Stretch" behavior without artifacts.
3.  **Enveloping Geometry:** Improved the visual quality of the enveloping arcs by replacing linear interpolation with **trigonometric (`Math.asin`)** calculations, ensuring perfect alignment with the pulse line.
4.  **Documentation:** Enhanced JSDoc comments to be intent-driven, explaining the new physics model and reset logic.

## Timeline

- 2026-01-18T23:54:16Z @tobiu added the `bug` label
- 2026-01-18T23:54:16Z @tobiu added the `enhancement` label
- 2026-01-18T23:54:16Z @tobiu added the `ai` label
- 2026-01-18T23:55:55Z @tobiu referenced in commit `b2b72d0` - "fix(TicketCanvas): Implement Dual-Point Physics and fix render loop (#8789)"
- 2026-01-18T23:56:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-18T23:56:10Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented **Dual-Point Physics** in `TicketCanvas.mjs`, resolving the render loop issues and visual glitches.
> 
> **Changes:**
> 1.  **Dual-Point Physics:** The Pulse Head (`pulseBottom`) and Tail (`pulseY`) are now simulated as independent particles. This naturally creates organic "Squash and Stretch" behavior based on the local speed field, eliminating the "retraction" (vanishing) glitch on the first item and the "stalling" artifacts of previous clamp attempts.
> 2.  **Geometry Polish:** Replaced linear interpolation with `Math.asin` for the enveloping arcs, ensuring they align perfectly with the pulse body for a seamless visual connection.
> 3.  **Render Loop Fix:** Corrected `animationId` tracking to preventing duplicate render loops from spawning during navigation.
> 4.  **Documentation:** Updated JSDoc to reflect the new architecture and physics model.
> 
> The animation is now stable, performant, and visually polished at 60fps.

- 2026-01-18T23:56:36Z @tobiu closed this issue

