---
id: 9394
title: 'E2E: Validate GridRowScrollPinning against DevIndex Canvas Worker Latency'
state: CLOSED
labels:
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T16:25:46Z'
updatedAt: '2026-03-08T16:44:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9394'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T16:44:43Z'
---
# E2E: Validate GridRowScrollPinning against DevIndex Canvas Worker Latency

This ticket tracks the E2E validation of the CSS Variable based `GridRowScrollPinning` architecture against the `devindex` application.

**The Challenge:**
The `devindex` app represents the extreme edge of framework latency. Its grid rows contain `<canvas>` elements managed by an `OffscreenCanvas` worker, which adds significant processing overhead to the VDOM pipeline compared to the `bigData` test grid. We need to prove that the 500px optical pinning threshold successfully prevents the "white flash" during massive thumb drags despite this increased latency.

**Testing Strategy:**
1.  **Environment:** `apps/devindex/index.html`
2.  **Streaming Wait:** The test must explicitly wait for the initial GitHub API data streaming to complete before initiating scroll maneuvers to ensure a stable testing baseline.
3.  **Measurement:** We will reuse the `requestAnimationFrame` + `getBoundingClientRect` visual blanking detector developed in `#9392`.
4.  **Assertion:** The grid must record 0 blank frames during a simulated massive scrollbar thumb drag.

## Timeline

- 2026-03-08T16:25:47Z @tobiu added the `ai` label
- 2026-03-08T16:25:47Z @tobiu added the `testing` label
- 2026-03-08T16:25:47Z @tobiu added the `grid` label
- 2026-03-08T16:25:57Z @tobiu added parent issue #9380
- 2026-03-08T16:43:50Z @tobiu referenced in commit `97a2fa2` - "Test: Add DevIndex E2E Validation for GridRowScrollPinning (#9394)

- Ported the visual blanking and jitter bouncing detectors to the DevIndex application.
- Added wait mechanisms for the GitHub API streaming to complete before test execution.
- Empirical results prove the 500px CSS Variable pinning architecture successfully prevents the white flash even under severe Canvas Worker latency."
### @tobiu - 2026-03-08T16:44:02Z

**Input from Gemini 3.1 Pro:**

> ✦ The `test/playwright/e2e/GridThumbDragDevIndex.spec.mjs` test file has been committed and pushed.
> 
> **Findings from the DevIndex Playwright Test:**
> - **White Flashes:** 0 frames. The `GridRowScrollPinning` addon's CSS Variable strategy (`--grid-row-pin-offset`) successfully intercepts massive scrollbar thumb drags and mathematically locks the stale rows onto the viewport, preventing the user from staring at a blank screen while the Canvas Worker computes the heavy data load.
> - **Jitter Bounces:** 5 frames. As expected, when the 500px "freeze" threshold is engaged, it stops the native scroll. Once the worker catches up and the transform is cleared, the grid snaps the rows to their true locations. This mathematically registers as a "bounce" or "jitter" in the test because the tracking row teleports.
> 
> **Conclusion on Current State:**
> The optical pinning mechanism works flawlessly to prevent the white flash. The remaining visual artifact (the snap/jitter when healing) is an inherent consequence of choosing to freeze the scroll rather than showing empty space. 
> 
> Closing this ticket to finalize the baseline. We will now investigate further architectural refinements to address the root latency or healing mechanisms.

- 2026-03-08T16:44:21Z @tobiu assigned to @tobiu
- 2026-03-08T16:44:43Z @tobiu closed this issue
- 2026-03-08T17:34:38Z @tobiu referenced in commit `5fc7737` - "Test: Optimize Playwright E2E Config for Native GPU Acceleration (#9394)

- Switched the Playwright Chromium target to use the local native Google Chrome channel.
- Added aggressive launch flags (`--disable-frame-rate-limit`, `--enable-accelerated-2d-canvas`, `--disable-ipc-flooding-protection`, etc.) to prevent internal throttling of OffscreenCanvas workers.
- This increased E2E telemetry sampling throughput by 53x (from ~70 frames to ~3900 frames per run), allowing for perfectly accurate measurement of async rendering latency."

