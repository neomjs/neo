---
id: 9387
title: 'E2E: Implement Main Thread Optical Pinning for Grid Scrolling'
state: CLOSED
labels:
  - enhancement
  - architecture
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-03-07T23:51:36Z'
updatedAt: '2026-03-08T12:07:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9387'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 9388 E2E: Enhance VDOM Update Pipeline with Meta Payload Support'
blocking: []
closedAt: '2026-03-08T12:07:41Z'
---
# E2E: Implement Main Thread Optical Pinning for Grid Scrolling

This ticket details the shift in strategy for resolving the "Stale Render Gap" during high-velocity Grid scrolling, based on empirical data gathered during E2E performance testing.

### What We Learned (The Failure of Predictive Math)
Initially, we attempted to solve the "blank screen during fast drag" problem by predicting the future `scrollTop` using velocity and pipeline lag (RTT). We passed this `predictedScrollTop` to `GridBody` to render rows ahead of the user.

**This failed completely for two reasons:**
1. **The Physical Reality of the Viewport:** `scrollTop` dictates the physical `translate3d` coordinate of the DOM pool. If we predict the user *will* be at `Y=20000` and paint the 29 rows there, but the native viewport is currently moving through `Y=15000`, the prediction literally paints the rows off-screen.
2. **Massive Logical Jumps:** A fast thumb drag on a 2.5 million pixel scrollbar generates jumps of 20,000+ pixels in a single tick. A 29-node DOM pool physically cannot cover that gap, no matter how clever the prediction math is.

### The New Strategy: Main Thread Optical Pinning ("Spring-Loaded Camera")
We must accept that during a massive teleport (e.g., jumping 500 rows instantly), the App Worker pipeline (30-50ms) will always be behind. We cannot fix this in the App Worker because it is out of sync with the physical reality of the screen.

Instead of predicting the future, we must **force the stale data to stay on screen until the new data arrives.**

**The Implementation Plan:**
1. **Event Driven:** `Neo.main.DomAccess.applyDeltas` must fire a synchronous event (e.g., `beforeApplyDeltas`) when a new batch of VDOM patches arrives.
2. **Main Thread Interception:** The `Neo.main.addon.ScrollSync` addon (or a dedicated grid addon) subscribes to this event.
3. **Gap Calculation:** When a delta batch arrives, the addon inspects the `translate3d(Y)` of the incoming grid rows (what the App Worker *thinks* the scroll position is) and compares it to the exact, real-time native `scrollTop` of the wrapper container.
4. **The Pinning Translation:** If the gap is huge (e.g., > 50 rows), the addon dynamically applies a `transform: translateY(gap)` to the **GridBody container itself**.
5. **The Optical Illusion:** This pushes the stale DOM nodes exactly into the user's current viewport. The user sees scrolling rows (even if the text data is temporarily wrong for that exact coordinate) instead of a multi-second white screen.
6. **The Release:** When the user stops dragging and the App Worker finally delivers the delta for the exact `scrollTop`, the gap becomes 0, and the container's `translateY` offset is removed seamlessly.

### Future Cleanup Considerations
*   The `Neo.util.Performance` tracker we built is highly valuable. While the predictive math failed, we can still use the RTT tracker to dynamically adjust the `syncGridBody` throttle (currently a static 16ms) to prevent App Worker queue starvation on slower machines.
*   Once the Main Thread pinning is working, we will need to audit and remove the flawed `scrollVelocity` prediction math from `ScrollManager.mjs`.

## Timeline

- 2026-03-07T23:51:37Z @tobiu added the `epic` label
- 2026-03-07T23:51:37Z @tobiu added the `architecture` label
- 2026-03-07T23:51:37Z @tobiu added the `performance` label
- 2026-03-07T23:51:37Z @tobiu added the `grid` label
- 2026-03-07T23:51:49Z @tobiu added parent issue #9380
- 2026-03-07T23:54:16Z @tobiu assigned to @tobiu
- 2026-03-08T00:30:37Z @tobiu removed the `epic` label
- 2026-03-08T00:30:37Z @tobiu added the `enhancement` label
- 2026-03-08T11:08:56Z @tobiu marked this issue as being blocked by #9388
- 2026-03-08T12:07:13Z @tobiu referenced in commit `0a29701` - "Enhancement: Implement Main Thread Optical Pinning for Grid Scrolling (#9387)

- Added the Neo.main.addon.GridRowScrollPinning addon.
- The addon intercepts Neo.main.DeltaUpdates events, calculates scroll deltaY based on meta payload, and applies just-in-time inline translate3d delta editing to pin rows visually during rapid scrolling.
- Added useRowScrollPinning config to Neo.grid.Container and ScrollManager to toggle the feature.
- Explicitly documented the by-reference mutation design pattern in Neo.main.DeltaUpdates."
### @tobiu - 2026-03-08T12:07:23Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `GridRowScrollPinning` Main Thread addon. It successfully parses the `meta` payload to determine the worker's baseline `scrollTop`, calculates the delta, and mutates the `translate3d` CSS string inside the VDOM delta stream before it hits the DOM. 
> 
> This successfully resolves the scroll thrashing/jitter issue by visually aligning the row data with the current scroll position, regardless of worker latency. 
> 
> Closing this ticket. The next step is to remove the legacy predictive heuristics.

- 2026-03-08T12:07:41Z @tobiu closed this issue

