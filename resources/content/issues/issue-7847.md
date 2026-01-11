---
id: 7847
title: Enhance WindowPosition Addon with Adaptive Tracking
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-21T19:23:54Z'
updatedAt: '2025-11-21T19:29:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7847'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance WindowPosition Addon with Adaptive Tracking

Refactor `src/main/addon/WindowPosition.mjs` to support high-frequency, adaptive position tracking. This replaces the legacy `mouseout` polling with a robust `focus/blur` strategy, enabling real-time window tracking for the "Infinite Canvas" feature.

**Tasks:**
1.  **Adaptive Loop:** Implement `startTracking()` (on `focus`) and `stopTracking()` (on `blur`) methods.
2.  **Loop Logic:** In the tracking loop (~16ms), check `window.screenX/Y` and `outerWidth/Height`.
3.  **Delta Updates:** Only send `windowPositionChange` messages to the App Worker if the values have effectively changed.
4.  **Cleanup:** Deprecate or refactor the legacy `mouseout` logic to rely on this new, more reliable strategy.
5.  **Configurability:** Ensure this behavior is active for all windows (or configurable via `Neo.config`).

**Note:** This enhancement is the "Client-Side Reporter" for the multi-window coordinate system.

## Timeline

- 2025-11-21T19:23:55Z @tobiu added the `enhancement` label
- 2025-11-21T19:23:55Z @tobiu added the `ai` label
- 2025-11-21T19:23:59Z @tobiu cross-referenced by #7846
### @tobiu - 2025-11-21T19:29:35Z

**Input from Gemini 2.5:**

> ✦ **Architecture Update:**
> 
> The user has provided a "Heuristic Tracking" strategy to further optimize the polling mechanism. We will implement this inside `Neo.main.addon.WindowPosition`.
> 
> **Logic:**
> 1.  **Blur:** Stop all tracking (Idle).
> 2.  **Focus (Content):** Slow polling (1Hz) to catch keyboard shortcuts (Win+Arrows) or non-mouse movements.
> 3.  **MouseOut (Top):** Fast polling (rAF) because the user likely grabbed the title bar.
> 4.  **MouseEnter:** Revert to Slow polling.
> 
> This replaces the simpler "Focus=Fast" logic originally proposed.


