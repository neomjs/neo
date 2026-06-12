---
id: 9369
title: '[Epic] Upgrade ScrollSync for Loop-Free Two-Way Binding (Mobile & Desktop)'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:37:45Z'
updatedAt: '2026-03-07T17:15:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9369'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9370 Upgrade ScrollSync Locking Mechanism'
  - '[x] 9371 API for Programmatic Scrolling in ScrollSync'
  - '[x] 9372 Refactor GridDragScroll to use ScrollSync API'
  - '[x] 9373 Enable Mobile Two-Way ScrollSync for Grid VerticalScrollbar'
  - '[x] 9374 Mobile UX Enhancements for Grid VerticalScrollbar (SCSS)'
  - '[x] 9375 Improve ScrollSync Lock Release Mechanism (rAF vs setTimeout)'
  - '[x] 9376 Add .neo-has-touch capability class and enhance Mobile Grid Scrollbar'
  - '[x] 9377 Define `--grid-scrollbar-touch-width` variable across all themes'
  - '[x] 9378 Extract desktop grid scrollbar width into a CSS variable'
  - '[x] 9379 Mobile Scrollbar UX: Increase touch width to 40px and theme thumb colors'
subIssuesCompleted: 10
subIssuesTotal: 10
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:15:27Z'
---
# [Epic] Upgrade ScrollSync for Loop-Free Two-Way Binding (Mobile & Desktop)

The current `ScrollSync.mjs` architecture relies on blind native `scroll` event listeners. To prevent infinite "ping-pong" feedback loops, it explicitly disables two-way synchronization on touch devices (`twoWay: Neo.config.hasMouseEvents`). This breaks the UX on mobile for virtualized components (like Grids with custom scrollbars), preventing users from grabbing and scrubbing the scrollbar. Furthermore, it conflicts with programmatic scrolling addons like `GridDragScroll` which continuously mutate the DOM during momentum animations.

This epic proposes upgrading `ScrollSync` to act as a stateful coordinator. By implementing an internal locking mechanism (`isCoordinating`), it can safely apply bidirectional scroll updates across multiple nodes and programmatic sources without triggering native event feedback loops.

## Timeline

- 2026-03-07T16:37:46Z @tobiu added the `enhancement` label
- 2026-03-07T16:37:46Z @tobiu added the `epic` label
- 2026-03-07T16:37:46Z @tobiu added the `ai` label
- 2026-03-07T16:37:47Z @tobiu added the `architecture` label
- 2026-03-07T16:38:41Z @tobiu cross-referenced by #9370
- 2026-03-07T16:38:48Z @tobiu added sub-issue #9370
- 2026-03-07T16:39:01Z @tobiu cross-referenced by #9371
- 2026-03-07T16:39:07Z @tobiu added sub-issue #9371
- 2026-03-07T16:39:14Z @tobiu cross-referenced by #9372
- 2026-03-07T16:39:20Z @tobiu added sub-issue #9372
- 2026-03-07T16:39:28Z @tobiu cross-referenced by #9373
- 2026-03-07T16:39:33Z @tobiu added sub-issue #9373
- 2026-03-07T16:39:40Z @tobiu cross-referenced by #9374
- 2026-03-07T16:39:56Z @tobiu added sub-issue #9374
- 2026-03-07T16:54:21Z @tobiu cross-referenced by #9375
- 2026-03-07T16:54:28Z @tobiu added sub-issue #9375
- 2026-03-07T16:54:33Z @tobiu assigned to @tobiu
- 2026-03-07T17:10:45Z @tobiu cross-referenced by #9376
- 2026-03-07T17:10:54Z @tobiu added sub-issue #9376
- 2026-03-07T17:15:28Z @tobiu closed this issue
- 2026-03-07T17:19:16Z @tobiu cross-referenced by #9377
- 2026-03-07T17:19:24Z @tobiu added sub-issue #9377
- 2026-03-07T17:26:15Z @tobiu cross-referenced by #9378
- 2026-03-07T17:26:21Z @tobiu added sub-issue #9378
- 2026-03-07T17:56:59Z @tobiu cross-referenced by #9379
- 2026-03-07T17:57:08Z @tobiu added sub-issue #9379
- 2026-03-07T18:25:57Z @tobiu cross-referenced by #9380

