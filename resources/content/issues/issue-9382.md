---
id: 9382
title: 'E2E: Implement Dynamic RTT Measurement for VDOM Updates'
state: CLOSED
labels:
  - ai
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-03-07T21:13:26Z'
updatedAt: '2026-03-07T21:50:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9382'
author: tobiu
commentsCount: 2
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T21:50:02Z'
---
# E2E: Implement Dynamic RTT Measurement for VDOM Updates

This ticket tracks the implementation of dynamic, real-time measurement of the VDOM pipeline's roundtrip time (RTT). 

**Goal:**
Instead of hardcoding a latency guess, we will use `performance.now()` to measure the exact time between a `createViewData` call and the moment the VDOM worker finishes applying the deltas.

**Tasks:**
1. Hook into `Neo.manager.VDomUpdate` to measure the completion of a specific `ownerId`'s update cycle.
2. Maintain an Exponential Moving Average (EMA) of the last `N` roundtrips to smooth out frame spikes.
3. Expose this dynamic `expectedRtt` so that `ScrollManager` can accurately calculate how far a scrollbar will travel during the *next* update cycle based on current velocity.

This is a sub-task of the Epic to resolve Grid Scroll Thrashing.

## Timeline

- 2026-03-07T21:13:28Z @tobiu added the `ai` label
- 2026-03-07T21:13:28Z @tobiu added the `architecture` label
- 2026-03-07T21:13:28Z @tobiu added the `performance` label
- 2026-03-07T21:13:36Z @tobiu added parent issue #9380
- 2026-03-07T21:30:11Z @tobiu cross-referenced by #9384
- 2026-03-07T21:39:44Z @tobiu referenced in commit `abc0c61` - "perf: Add VDOM update performance hooks (#9382)

Adds beforeExecuteVdomUpdate and afterExecuteVdomUpdate hooks to Neo.mixin.VdomLifecycle to measure the precise cross-worker latency of VDOM updates.
Implements these hooks in Neo.grid.Body to track dynamic RTT during active scrolling via the new Neo.util.Performance tracker."
- 2026-03-07T21:39:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T21:40:09Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the RTT telemetry hooks.
> 
> `Neo.mixin.VdomLifecycle` now provides `beforeExecuteVdomUpdate` and `afterExecuteVdomUpdate`. These strictly measure the `updateBatch` worker call and the subsequent Main thread paint latency, intentionally excluding any App-worker queue wait time.
> 
> `Neo.grid.Body` implements these hooks to record the `grid.scroll:<id>` duration using the new `Performance` utility, but only when `isScrolling` is true to minimize noise.
> 
> The baseline metrics are now available for `ScrollManager` to query. We can close this ticket and move on to the predictive math in #9383.

- 2026-03-07T21:49:39Z @tobiu referenced in commit `b2e9ef3` - "perf: Add createViewData performance benchmark (#9382)

Instruments `Neo.grid.Body.createViewData()` to measure the synchronous generation time ({gen}$) during active scrolling, using the `Neo.util.Performance` tracker. This complements the asynchronous VDOM RTT tracking."
### @tobiu - 2026-03-07T21:49:45Z

**Input from Gemini 3.1 Pro:**

> ✦ I have added the second benchmark inside `GridBody.mjs` -> `createViewData()`.
> 
> This will track `grid.createViewData:<id>`, explicitly measuring the synchronous execution time ($T_{gen}$) required to map the records to the row pool and calculate the new VDOM structure.
> 
> With both the synchronous generation time and the asynchronous cross-worker roundtrip ($T_{rtt}$) now actively monitored by `Neo.util.Performance`, we have all the data required for the predictive scroll math.
> 
> I will close this sub-ticket, and we can proceed to #9383 (Predictive Delta Injection).

- 2026-03-07T21:50:02Z @tobiu closed this issue

