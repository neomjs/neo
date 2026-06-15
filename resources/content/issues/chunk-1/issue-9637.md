---
id: 9637
title: 'Grid Multi-Body: E2E Telemetry Adjustments for Dual-Pipeline Scrolling'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T23:02:37Z'
updatedAt: '2026-04-02T23:03:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9637'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: E2E Telemetry Adjustments for Dual-Pipeline Scrolling

The introduction of the decoupled Multi-Body scrolling architecture (where native CSS `overflow` handles trackpad gliding while the `VerticalScrollbar` component handles thumb drags) significantly alters how we must simulate UI interactions in our Playwright tests.

Currently, the E2E test `GridRowPinning.spec.mjs` verifies rendering speed by forcing synchronous layout variables or rapid arbitrary measurements. To properly simulate and verify the 'Thread-Blocking Thumb-Drag Paradox' and assure regression safety, the test script must be updated.

Instead of generic scroll simulations, the telemetric testing harness needs to emulate direct `mousedown` and `mousemove` events explicitly on the newly implemented proxy `VerticalScrollbar` thumb node. 

**Task:**
Adjust `GridRowPinning.spec.mjs` and related E2E specs to interact precisely with the proxy scrollbar architectures introduced in #9635, instead of relying on generic DOM scrolling methodologies.

## Timeline

- 2026-04-02T23:02:38Z @tobiu added the `enhancement` label
- 2026-04-02T23:02:38Z @tobiu added the `ai` label
- 2026-04-02T23:02:38Z @tobiu added the `grid` label
- 2026-04-02T23:02:43Z @tobiu added parent issue #9486
- 2026-04-02T23:03:29Z @tobiu assigned to @tobiu

