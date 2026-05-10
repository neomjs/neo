---
id: 8916
title: Implement Kinetic/Momentum Scrolling in GridDragScroll
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-30T13:25:21Z'
updatedAt: '2026-01-30T13:55:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8916'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T13:55:58Z'
---
# Implement Kinetic/Momentum Scrolling in GridDragScroll

**Problem:**
By consolidating touch scrolling into `GridDragScroll` and using `preventDefault()` on `touchmove` events, we have effectively disabled the browser's native momentum (inertial) scrolling. This results in a "dead" feel where the scroll stops instantly upon release, which is jarring for mobile users and sub-optimal for desktop "throw" interactions.

**Solution:**
Implement kinetic scrolling physics within the `Neo.main.addon.GridDragScroll` addon.

**Requirements:**
1.  **Velocity Tracking:** Calculate the velocity (pixels/ms) of the drag gesture based on the last few movement events.
2.  **Decay Animation:** Upon `onDragEnd`, if the velocity exceeds a threshold, initiate a `requestAnimationFrame` loop that continues to scroll the grid.
3.  **Friction:** Apply a friction factor to the velocity in each frame to gradually slow it down until it stops.
4.  **Bounce/Boundary:** (Optional but good) Handle hitting the scroll limits gracefully.
5.  **Interruption:** Ensure that a new `mousedown` or `touchstart` instantly stops any active kinetic animation.

**Benefits:**
*   Restores the expected "native" feel on mobile devices.
*   Provides a premium, smooth scrolling experience on desktop (mouse throw).
*   Maintains the zero-latency architecture while adding polish.

## Timeline

- 2026-01-30T13:25:22Z @tobiu added the `enhancement` label
- 2026-01-30T13:25:23Z @tobiu added the `developer-experience` label
- 2026-01-30T13:25:23Z @tobiu added the `ai` label
- 2026-01-30T13:25:23Z @tobiu added the `performance` label
- 2026-01-30T13:52:45Z @tobiu referenced in commit `9db8eb4` - "feat: Implement Kinetic/Momentum Scrolling in GridDragScroll (#8916)"
- 2026-01-30T13:54:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T13:55:21Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented kinetic (momentum) scrolling in the `GridDragScroll` addon.
> 
> ### Implementation Details
> 
> **1. Kinetic Engine (`autoScroll`):**
> *   **Decay Animation:** Implemented a `requestAnimationFrame` loop that continues scrolling after the user releases the drag.
> *   **Friction:** Applies an exponential decay factor of `0.95` per frame to simulate friction.
> *   **Threshold:** The animation stops automatically when velocity drops below `0.1` pixels/frame.
> 
> **2. Velocity Tracking:**
> *   **History Buffer:** `onDragMove` maintains a rolling history of the last 10 drag events (timestamp and position).
> *   **Calculation:** `onDragEnd` calculates the release velocity based on the last 100ms of movement data, ensuring the "throw" feels responsive to the user's final gesture.
> 
> **3. UX Enhancements:**
> *   **Cursor Feedback:** Sets `cursor: grabbing !important` on `document.body` during mouse drag operations to provide clear visual feedback.
> *   **Interruption:** Any new `mousedown` or `touchstart` event instantly cancels an active kinetic animation, allowing the user to "catch" and stop the scroll.
> 
> **Outcome:**
> The grid now supports smooth, physics-based scrolling on both desktop (mouse throw) and mobile (touch momentum), matching the native feel while running entirely on the Main Thread.

- 2026-01-30T13:55:59Z @tobiu closed this issue

