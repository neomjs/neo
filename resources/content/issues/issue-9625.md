---
id: 9625
title: 'Multi-Body Grid: Visually delegate native vertical scrollbar UX with CSS'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-01T21:01:20Z'
updatedAt: '2026-04-02T07:46:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9625'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T07:46:25Z'
---
# Multi-Body Grid: Visually delegate native vertical scrollbar UX with CSS

When `lock: end` columns exist in a multi-body grid, the native vertical scrollbar visually appears between the center rows and the locked end rows. This breaks UX expectations. 

Instead of reverting to a custom and slow `VerticalScrollbar` component, we will implement a CSS-driven visual delegation pattern:
1. Apply a `.neo-hide-scrollbar` SCSS class to the `bodyStart` and `body` grid wrappers so their native `overflow-y` capability remains functional for mouse wheels/trackpads, but is hidden from the UI.
2. The `lock: end` wrapper (or `center` if `lock: end` is absent) will remain the only visually rendered trackway.
3. Update `GridDragScroll` to gracefully ignore hidden scrollbars when calculating thumb-drag boundaries.
4. Repoint the `GridRowScrollPinning` Addon listener logic to attach dynamically to whichever wrapper natively holds the active scrollbar thumb.

## Timeline

- 2026-04-01T21:01:21Z @tobiu added the `enhancement` label
- 2026-04-01T21:01:21Z @tobiu added the `ai` label
- 2026-04-01T21:01:59Z @tobiu added parent issue #9486
- 2026-04-02T07:46:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-02T07:46:25Z

already resolved.

- 2026-04-02T07:46:26Z @tobiu closed this issue
- 2026-04-02T08:26:31Z @tobiu referenced in commit `534194d` - "fix: Stabilize Multi-Body Grid Vertical Scrollbar UX & Synchronization (#9625)"

