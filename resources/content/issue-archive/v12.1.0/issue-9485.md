---
id: 9485
title: 'Grid: Horizontal Scroll Performance & Jitter for Locked Columns'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T15:08:46Z'
updatedAt: '2026-03-16T19:37:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9485'
author: tobiu
commentsCount: 0
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-16T19:37:29Z'
---
# Grid: Horizontal Scroll Performance & Jitter for Locked Columns

We implemented the core architectural requirements for the locked columns feature, but horizontal scrolling performance is currently laggy and jitterish. The locked columns visually lag behind while scrolling, taking hundreds of milliseconds to catch up.

We have applied some initial fixes (throttling the main thread addon, implementing cell recycling for Pass 2 to reduce VDOM deltas, and resolving an issue with the visibility state of locked `Component` columns), but further investigation is needed to achieve 60fps locked column pinning.

We need to deeply profile the horizontal scroll event pipeline and challenge the CSS architecture (e.g. relying on both `left` for layout and `transform: translateX` for offsets).

**Tasks:**
- [x] Fix VDOM thrashing for locked cells by applying Pass 1 recycling logic to Pass 2.
- [x] Fix visibility bug causing locked `Component` columns (`hideMode: 'visibility'`) to vanish.
- [x] Add `requestAnimationFrame` throttle to `GridColumnScrollPinning.mjs` to prevent CSS var flood.
- [ ] Profile horizontal scroll tick performance.
- [ ] Evaluate replacing `left` + `transform` with purely CSS variable-driven layout logic (`left: calc(...)`) or similar GPU-friendly approaches.

## Timeline

- 2026-03-16T15:08:48Z @tobiu added the `bug` label
- 2026-03-16T15:08:48Z @tobiu added the `ai` label
- 2026-03-16T15:08:49Z @tobiu added the `grid` label
- 2026-03-16T15:09:29Z @tobiu added parent issue #9456
- 2026-03-16T15:09:38Z @tobiu referenced in commit `269e4c8` - "fix: Resolve locked column VDOM thrashing and throttle pinning addon (#9485)"
- 2026-03-16T15:09:55Z @tobiu assigned to @tobiu
- 2026-03-16T19:37:29Z @tobiu closed this issue

