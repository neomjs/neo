---
id: 9386
title: 'E2E: Add min velocity threshold to Grid Predictive Scrolling'
state: CLOSED
labels:
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-07T22:44:21Z'
updatedAt: '2026-03-07T22:47:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9386'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T22:47:24Z'
---
# E2E: Add min velocity threshold to Grid Predictive Scrolling

This ticket tracks the implementation of a minimum velocity threshold for Predictive Delta Injection in `ScrollManager`.

**Goal:**
Fix the "jumpy" and "flickering" rendering behavior during low-velocity scrolling (e.g., mousewheel).

**Tasks:**
1. Update `syncGridBody` to require a minimum `scrollVelocity` (e.g., > 0.5 px/ms) before applying the kinematic prediction math.
2. For velocities below the threshold, fall back to rendering the exact, actual `scrollTop`.

This ensures that prediction only engages during deliberate, fast thumb drags where the worker pipeline lag actually causes a visible gap, preserving 1:1 pixel accuracy for precise scrolling.

This is a sub-task of the Epic to resolve Grid Scroll Thrashing.

## Timeline

- 2026-03-07T22:44:21Z @tobiu added the `ai` label
- 2026-03-07T22:44:21Z @tobiu added the `performance` label
- 2026-03-07T22:44:22Z @tobiu added the `grid` label
- 2026-03-07T22:44:28Z @tobiu added parent issue #9380
- 2026-03-07T22:46:02Z @tobiu referenced in commit `7e62b15` - "fix: Add min velocity threshold to Grid Predictive Scrolling (#9386)

Disables the kinematic predictedScrollTop math for low-velocity scroll events (like mousewheel ticks) where Math.abs(scrollVelocity) <= 0.5. This prevents the VDOM from jumping ahead of the native viewport and causing visual flickering during precise scrolling."
- 2026-03-07T22:46:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T22:46:29Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the minimum velocity threshold in `ScrollManager`.
> 
> The kinematic prediction math now only engages if `Math.abs(scrollVelocity) > 0.5`. 
> For low-velocity scrolling (like a typical `mousewheel` tick), the Grid simply renders the exact, real-time `scrollTop` of the native container. This completely eliminates the decoupling effect and fixes the "jumpy/flickering" visual regression for precise scroll movements.
> 
> Closing this ticket as complete. We can now proceed with extracting E2E benchmark logs or tackling the directional buffer expansion for massive thumb jumps.

- 2026-03-07T22:47:24Z @tobiu closed this issue

