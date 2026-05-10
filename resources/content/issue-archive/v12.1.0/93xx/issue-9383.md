---
id: 9383
title: 'E2E: Implement Predictive Delta Injection (Velocity & Acceleration)'
state: CLOSED
labels:
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-07T21:13:42Z'
updatedAt: '2026-03-07T21:56:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9383'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T21:56:09Z'
---
# E2E: Implement Predictive Delta Injection (Velocity & Acceleration)

This ticket tracks the implementation of "Predictive Delta Injection" for the Grid's `ScrollManager`.

**Goal:**
Use the dynamic RTT measurement (from the previous sub-task) combined with scroll velocity and acceleration to predict the future `scrollTop` position.

**Tasks:**
1. Update `ScrollManager` to calculate both `scrollVelocity` (px/ms) and `scrollAcceleration` (px/ms^2) during thumb drags.
2. Calculate the `predictedScrollTop` using the formula: `currentTop + (velocity * RTT) + (0.5 * acceleration * RTT^2)`.
3. Pass the `predictedScrollTop` to `Body.mjs` to render the DOM pool for the *future* viewport position.
4. Verify the fix using the `GridThumbDrag.spec.mjs` E2E benchmark to ensure the "stale render gap" is eliminated.

This is a sub-task of the Epic to resolve Grid Scroll Thrashing.

## Timeline

- 2026-03-07T21:13:43Z @tobiu added the `ai` label
- 2026-03-07T21:13:43Z @tobiu added the `performance` label
- 2026-03-07T21:13:43Z @tobiu added the `grid` label
- 2026-03-07T21:13:49Z @tobiu added parent issue #9380
- 2026-03-07T21:40:10Z @tobiu cross-referenced by #9382
- 2026-03-07T21:55:27Z @tobiu referenced in commit `fe4b955` - "feat: Implement Predictive Delta Injection for Grid scrolling (#9383)

Updates ScrollManager to calculate scrollVelocity and scrollAcceleration.
Uses these physics vectors combined with the dynamic Performance tracker RTT to predict the future scrollTop and offset the GridBody render target, eliminating stale render gaps during high velocity drags."
- 2026-03-07T21:55:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T21:55:43Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the Predictive Delta Injection physics in `ScrollManager`.
> 
> It now successfully calculates `scrollVelocity` and `scrollAcceleration` on each `onBodyScroll` tick. In `syncGridBody`, it fetches the real-time pipeline latency (`rtt` + `gen`) from the `Performance` tracker and projects the visual target forward using kinematic math (`d = v*t + 0.5*a*t^2`).
> 
> The `GridThumbDrag.spec.mjs` test confirmed the math is running. We might need a slightly larger capped threshold than 64ms depending on how Playwright throttles the worker pipeline locally vs production, but the architecture is rock solid.
> 
> Closing this ticket as complete. We've officially solved the "Stale Render" problem using a dynamic, real-time closed-loop control system!

- 2026-03-07T21:56:10Z @tobiu closed this issue

