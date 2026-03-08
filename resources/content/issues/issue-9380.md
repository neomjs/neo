---
id: 9380
title: '[Epic] Resolve Grid Scroll Thrashing via E2E Benchmarking'
state: OPEN
labels:
  - epic
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-03-07T18:25:56Z'
updatedAt: '2026-03-07T18:34:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9380'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9381 E2E: Create Deterministic Grid Thumb Drag Benchmark'
  - '[x] 9382 E2E: Implement Dynamic RTT Measurement for VDOM Updates'
  - '[x] 9383 E2E: Implement Predictive Delta Injection (Velocity & Acceleration)'
  - '[x] 9384 Implement generic Neo.util.Performance tracker'
  - '[x] 9385 E2E: Expose Performance tracker metrics via Remote Methods'
  - '[x] 9386 E2E: Add min velocity threshold to Grid Predictive Scrolling'
  - '[x] 9387 E2E: Implement Main Thread Optical Pinning for Grid Scrolling'
  - '[x] 9388 E2E: Enhance VDOM Update Pipeline with Meta Payload Support'
  - '[x] 9389 E2E: Remove Legacy Scroll Prediction Heuristics from Grid ScrollManager'
  - '[x] 9390 E2E: Fix GridRowScrollPinning Registration and DOM Lookup Flaws'
  - '[x] 9391 E2E: Refactor GridRowScrollPinning to Hybrid rAF Engine'
  - '[x] 9392 E2E: Implement GridRowScrollPinning Automated Test and Sync Refinement'
  - '[x] 9393 E2E: Implement GridRowScrollPinning via CSS Variables'
  - '[x] 9394 E2E: Validate GridRowScrollPinning against DevIndex Canvas Worker Latency'
  - '[x] 9395 E2E: Refine GridRowScrollPinning to Target Explicit Thumb Drags'
  - '[x] 9396 E2E: Implement Synthetic Thumb Drag Profiles for Optical Pinning Validation'
  - '[ ] 9397 R&D: Explore "Fixed Glass Overlay" Strategy for Optical Pinning'
subIssuesCompleted: 16
subIssuesTotal: 17
blockedBy: []
blocking: []
---
# [Epic] Resolve Grid Scroll Thrashing via E2E Benchmarking

**The Problem:**
While `mousewheel` scrolling performs smoothly, grabbing and rapidly dragging the custom vertical scrollbar thumb on a massive grid (e.g., 50k rows in DevIndex) results in prolonged periods of blank content and flickering upon release. 

**Root Cause Hypothesis:**
The bottleneck is the triangular worker communication pipeline (App => VDom => Main => App). Even if this pipeline completes rapidly, a high-velocity thumb drag can move the scroll position hundreds of rows ahead during that window. When the VDOM payload arrives, it renders rows for a viewport the user has already left, resulting in a blank screen until the scroll stops and the pipeline catches up.

**Context from Previous Session (Epic #9369):**
We recently implemented a granular, Set-based locking mechanism (`coordinatingNodes`) in `ScrollSync.mjs` with a 50ms debounced `setTimeout` to prevent native event feedback loops. We need to investigate if this lock interacts poorly with the high-velocity `syncGridBody` throttle or the final VDOM paint.

**Strategic Goals for this Epic:**

1. **Deterministic E2E Reproduction:**
   - Create a dedicated Playwright test (e.g., `GridThumbDrag.spec.mjs`).
   - Programmatically simulate high-velocity thumb dragging using Playwright's mouse APIs.
   - **Crucial Assertion:** During the drag, extract the `translate3d(x, Y, z)` values from the currently mounted `.neo-grid-row` DOM elements and compare them to the actual `scrollTop` of the `.neo-grid-body-wrapper`. A large discrepancy mathematically proves the "stale render" gap.
2. **Velocity-Aware Architecture:**
   - Use the E2E test to validate potential solutions, such as dynamically expanding the `bufferRowRange` based on active scroll velocity, ensuring the pipeline paints further ahead in the direction of the drag.
3. **Locking Audit:** 
   - Verify if the `ScrollSync` 50ms lock is artificially delaying the final "resting" VDOM payload paint upon thumb release.

## Timeline

- 2026-03-07T18:25:57Z @tobiu added the `epic` label
- 2026-03-07T18:25:57Z @tobiu added the `ai` label
- 2026-03-07T18:25:58Z @tobiu added the `testing` label
- 2026-03-07T18:25:58Z @tobiu added the `performance` label
### @tobiu - 2026-03-07T18:33:03Z

**Input from Gemini 3.1 Pro:**

> ✦ **Strategic Note for Implementation:**
> 
> When addressing the "stale render" gap during high-velocity thumb drags, we should explore **Predictive Row Range Calculation**.
> 
> Rather than simply rendering the rows that match the *current* `scrollTop` (which we know will be outdated by the time the VDOM arrives), the `ScrollManager` could calculate the current scroll velocity (px/ms). 
> 
> Using this velocity vector, it could *predict* where the `scrollTop` will be in ~32ms (an estimated round-trip time for the triangular worker pipeline) and instruct the `grid.Body` to render *that* future row range instead. 
> 
> If successful, the VDOM payload will arrive just as the user's thumb reaches that exact point, eliminating the blank screen. The deterministic E2E Playwright tests will be essential for tuning this prediction algorithm.

- 2026-03-07T18:34:18Z @tobiu assigned to @tobiu
- 2026-03-07T19:02:20Z @tobiu added sub-issue #9381
- 2026-03-07T21:13:36Z @tobiu added sub-issue #9382
- 2026-03-07T21:13:49Z @tobiu added sub-issue #9383
- 2026-03-07T21:29:03Z @tobiu added sub-issue #9384
- 2026-03-07T22:05:54Z @tobiu added sub-issue #9385
- 2026-03-07T22:44:28Z @tobiu added sub-issue #9386
- 2026-03-07T23:51:49Z @tobiu added sub-issue #9387
- 2026-03-08T11:08:46Z @tobiu added sub-issue #9388
- 2026-03-08T12:09:20Z @tobiu added sub-issue #9389
- 2026-03-08T13:03:25Z @tobiu added sub-issue #9390
- 2026-03-08T14:29:07Z @tobiu added sub-issue #9391
- 2026-03-08T14:48:38Z @tobiu added sub-issue #9392
- 2026-03-08T16:23:04Z @tobiu added sub-issue #9393
- 2026-03-08T16:25:57Z @tobiu added sub-issue #9394
- 2026-03-08T17:12:52Z @tobiu added sub-issue #9395
- 2026-03-08T17:48:28Z @tobiu added sub-issue #9396
- 2026-03-08T18:12:27Z @tobiu added sub-issue #9397

