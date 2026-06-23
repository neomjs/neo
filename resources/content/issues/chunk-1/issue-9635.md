---
id: 9635
title: 'Grid Multi-Body: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees: []
createdAt: '2026-04-02T22:54:02Z'
updatedAt: '2026-06-23T03:19:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9635'
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
closedAt: '2026-06-23T03:19:47Z'
---
# Grid Multi-Body: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning

## Context
During the initial implementation of the Multi-Body architecture, the dual-pipeline scrolling architecture was removed, with the assumption that native CSS overflow scrolling on the `GridContainer` wrapper would sufficiently handle both trackpad events and manual native thumb-dragging.

## The Thread-Blocking Thumb-Drag Paradox
While CSS overflow operates asynchronously allowing perfect trackpad scroll physics, manually dragging the browser's native vertical scrollbar thumb blocks the Main Thread and causes the DOM viewport to shift _before_ the backend AppWorker can compute the VDOM delta and pass the updated Virtual Row positions over the worker bridge.

This results in severe visual clipping framing and blank rows. The browser's native compositing engine optimizes out DOM areas unrendered, meaning that during a fast 4000px jump, the screen goes entirely blank until the worker thread catches up.

## The Fix: Dual-Pipeline Architecture
We are reintroducing the proxy `neo-grid-vertical-scrollbar` component.
1. The real vertical grid container is set to hide the native scrollbar, processing native multi-touch scrolling via purely async hardware acceleration perfectly.
2. The proxy scrollbar is visually overlaid on the right edge of the Grid as a standalone item via absolutely positioned CSS inside the container.
3. The `GridRowScrollPinning` Main Thread addon physically listens for manual scrolling (`mousedown` on the dummy scrollbar). When the user drags this dummy thumb, the addon specifically forces the row nodes via synchronous `translate3d` GPU transform offsets to lock them perfectly into Phase with the scroll state while waiting for the VDOM to ship updates.

This effectively shields the framework from chromium optimization bugs occurring when high-velocity JS thumb-drags generate backpressure lag.

## Actions
- Reinstate VerticalScrollbar.mjs and VerticalScrollbar.scss
- Flatten the DOM by injecting the proxy scrollbar directly into the GridContainer items array instead of through VDOM mutation overrides.
- Lock GridRowScrollPinning logic to the new proxy ID, and refine mathematical phase checking logic to restore zero lag grid row panning.

## Timeline

- 2026-04-02T22:54:03Z @tobiu added the `enhancement` label
- 2026-04-02T22:54:03Z @tobiu added the `ai` label
- 2026-04-02T22:54:04Z @tobiu added the `grid` label
- 2026-04-02T22:54:09Z @tobiu added parent issue #9486
- 2026-04-02T22:55:35Z @tobiu referenced in commit `defa8b5` - "feat: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning (#9635)"
- 2026-04-02T22:56:59Z @tobiu referenced in commit `178c91a` - "feat: Add missing VerticalScrollbar source and style files (#9635)"
- 2026-04-02T23:02:38Z @tobiu cross-referenced by #9637
### @neo-gpt - 2026-06-23T03:19:35Z

[ARCH_ALIGNMENT]

Ticket-intake verdict: **already-resolved / missing close-link**, not a current implementation lane.

Evidence checked on 2026-06-23:

- #9635 is still open, unassigned, and unchanged since `2026-04-02T22:54:02Z`; labels are `enhancement`, `ai`, and `grid`. With the current 90-day inactive-issue stale window, this is still `pre-stale`, but the source/commit trail is decisive.
- The requested source exists:
  - `src/grid/VerticalScrollbar.mjs` implements the dual-pipeline proxy scrollbar and documents the thread-blocking thumb-drag paradox.
  - `resources/scss/src/grid/VerticalScrollbar.scss` defines the proxy scrollbar styling.
  - `src/grid/Container.mjs` imports/creates/pushes `VerticalScrollbar` into the grid items array.
  - `src/grid/ScrollManager.mjs` registers `GridRowScrollPinning` with `verticalScrollbarId`.
  - `src/main/addon/GridRowScrollPinning.mjs` registers against the dummy scrollbar, listens for thumb drag, and applies synchronous GPU pinning offsets across body ids.
- Git history has direct ticket evidence:
  - `defa8b5b61 feat: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning (#9635)`
  - `178c91a644 feat: Add missing VerticalScrollbar source and style files (#9635)`
- `gh pr list --search "9635 OR \"Grid Multi-Body\" OR \"GPU Thumb\""` did not surface a PR close-link; the issue stayed open because the work landed through commit references without closing this tracker item.

I am closing #9635 as completed. #9637 remains a separate follow-up for telemetry adjustments; any new scrollbar/pinning work should be cut against current grid behavior rather than reopening this completed implementation ticket.

- 2026-06-23T03:19:47Z @neo-gpt closed this issue
- 2026-06-23T04:01:40Z @neo-gpt cross-referenced by #9611

