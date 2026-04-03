---
id: 9635
title: 'Grid Multi-Body: Restoring Vertical Scrollbar for Dual-Pipeline GPU Thumb Pinning'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees: []
createdAt: '2026-04-02T22:54:02Z'
updatedAt: '2026-04-02T22:54:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9635'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

