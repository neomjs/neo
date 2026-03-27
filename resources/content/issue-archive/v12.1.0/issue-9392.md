---
id: 9392
title: 'E2E: Implement GridRowScrollPinning Automated Test and Sync Refinement'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T14:48:30Z'
updatedAt: '2026-03-08T16:20:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9392'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T16:20:53Z'
---
# E2E: Implement GridRowScrollPinning Automated Test and Sync Refinement

This ticket tracks the creation of automated E2E tests for the `GridRowScrollPinning` architecture using Playwright, targeting the extreme scale of the `examples/grid/bigData` application.

**The Problem:**
While the initial `GridRowScrollPinning` addon implemented a hybrid rAF engine to sync VDOM deltas with native scrolling, manual testing reveals edge cases (like slow thumb drags over massive distances) where the grid still visually tears or goes blank due to misalignments between `scrollTop`, `translate3d`, and the browser's compositor layer culling.

**Testing Strategy:**
1.  **Environment:** `examples/grid/bigData/index.html` configured for 100,000 rows (20M cells).
2.  **Simulation:** Playwright will simulate slow, continuous vertical scrollbar thumb drags.
3.  **Measurement:** We will extract empirical data (`actualScrollTop`, `workerScrollTop`, `deltaY`, and the DOM `transform` values) frame-by-frame during the drag.
4.  **Assertion:** The test must mathematically prove that the rows remain within the visible viewport bounds on every single frame, effectively detecting the "white flash" or "ping-pong" tearing.

**Refinement Goal:**
Once the test reliably fails by exposing the mechanical flaw, we will use the data to refine the architectural approach (e.g., implementing an "Inner Row Container" layer or synchronous scroll injection) until the test passes.

## Timeline

- 2026-03-08T14:48:31Z @tobiu added the `enhancement` label
- 2026-03-08T14:48:31Z @tobiu added the `ai` label
- 2026-03-08T14:48:31Z @tobiu added the `testing` label
- 2026-03-08T14:48:31Z @tobiu added the `grid` label
- 2026-03-08T14:48:38Z @tobiu added parent issue #9380
- 2026-03-08T15:14:25Z @tobiu assigned to @tobiu
- 2026-03-08T15:15:46Z @tobiu referenced in commit `0ea2074` - "Test: Add E2E Visual Blanking Detector for GridRowScrollPinning (#9392)

- Created `test/playwright/e2e/GridRowPinning.spec.mjs`.
- Targets `examples/grid/bigData/index.html` scaled to 100,000 rows.
- Injects a continuous `requestAnimationFrame` monitor during simulated high-speed wheel scrolling.
- Uses `getBoundingClientRect()` to perfectly calculate if the painted row cluster is pushed completely outside the visible viewport wrapper bounds.
- Provides empirical proof of the 'white flash' latency tearing and the bounds-breaking flaw of the current body transform strategy."
### @tobiu - 2026-03-08T15:15:56Z

**Input from Gemini 3.1 Pro:**

> ✦ The initial `test/playwright/e2e/GridRowPinning.spec.mjs` test has been pushed to the repository.
> 
> **Test Overview:**
> - Targets the `bigData` example grid.
> - Uses Playwright to programmatically scale the grid to 100,000 rows (20M cells) via the UI controls.
> - Simulates rapid, continuous wheel scrolling.
> - Injects a `requestAnimationFrame` loop that calculates the physical `getBoundingClientRect` of the viewport wrapper and the rendered row nodes on every frame.
> - Explicitly detects "White Flashes" by proving if the row bounding box is pushed entirely above or below the visible viewport wrapper.
> 
> **Results:**
> The test successfully fails as expected against the current architecture. The empirical data proves two critical flaws in our current pinning strategy:
> 1.  **Latency Tearing:** The VDOM worker is too slow to calculate rows for massive scroll jumps. The native browser scroll pushes the existing stale rows entirely off-screen before the worker responds.
> 2.  **Bounds Breaking:** When the pinning addon *does* kick in and applies a massive `translate3d` to the `neo-grid-body` node, it pushes the massive 2.5M pixel scroll container down, shifting the layout bounds and pushing the rows out of the bottom of the viewport.
> 
> The next step is to brainstorm a new strategy based on these empirical findings.

- 2026-03-08T16:20:53Z @tobiu closed this issue

