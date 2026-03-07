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
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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

