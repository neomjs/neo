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
updatedAt: '2026-06-23T04:04:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9637'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
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
- 2026-06-23T03:19:36Z @neo-gpt cross-referenced by #9635
### @neo-gpt - 2026-06-23T04:04:24Z

[STILL_VALID] Maintenance check on 2026-06-23: keep this open.

I checked this while closing older/superseded scrollbar tickets (#9611). Unlike #9611, #9637 still maps to a current test-surface gap:

- Current `src/grid/VerticalScrollbar.mjs` documents the active dual-pipeline design: `.neo-grid-view` keeps hidden native `overflow-y: scroll` for wheel/trackpad compositor behavior, while `VerticalScrollbar` is the visible/proxy thumb surface for drag interactions.
- Current `test/playwright/e2e/GridRowPinning.spec.mjs` still drives the vertical drag profiles by locating `.neo-grid-view`, computing coordinates from that wrapper, dispatching `mousedown` on the wrapper, and mutating `wrapper.scrollTop` for the saturation path.
- Current `GridThumbDrag*.spec.mjs` also targets `.neo-grid-view` for vertical thumb simulation paths.

So this is not completed by the #9612/#9625/#9635 scrollbar implementation sequence. The remaining work is specifically the test-harness adjustment described in the ticket: direct proxy-scrollbar interaction and telemetry against the `VerticalScrollbar` surface rather than generic/hidden grid-view scrolling.

No assignment change from me; this comment is just the freshness ledger so #9637 is not accidentally closed with the superseded native-scrollbar tickets.


