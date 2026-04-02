---
id: 9630
title: 'Grid: Implement Main-Thread Addon Hover Synchronization'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T09:27:53Z'
updatedAt: '2026-04-02T09:57:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9630'
author: tobiu
commentsCount: 1
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T09:57:49Z'
---
# Grid: Implement Main-Thread Addon Hover Synchronization

This is an architecture sub-task for Epic #9626.

## Problem Description
The transition to a multi-body grid architecture means that a single logical row is now split across up to three physical grid bodies (Start, Center, End). Native SCSS `:hover` states only apply to the DOM nodes within a single grid body, resulting in disconnected highlighting when a user hovers over a segmented row.

To maintain perfect GPU scrolling performance and eliminate CSS bundle bloat, we need a hyper-optimized Main-Thread mechanism to synchronize these hover states.

## Proposed Solution
Introduce the `Neo.main.addon.GridRowHoverSync` addon to systematically delegate native pointer events across multiple grid bodies with **zero layout thrashing**.

1. **Native Hit-Testing**: The Addon completely avoids computationally expensive `mousemove` coordination. It relies purely on the browser's native `mouseover` / `mouseout` event propagation. It perfectly complements `pointer-events: none` virtualization by letting the Browser GPU handle the lifecycle natively when a scroll buffer terminates.
2. **`relatedTarget` Bailout**: The Addon diffs the `e.relatedTarget` dynamically. If the pointer navigates within the boundaries of an identical `data-record-id`, it bypasses DOM mutations entirely, resulting in exactly zero unnecessary class toggles.
3. **Dynamic Toggle Base**: The Addon automatically unregisters itself via `GridContainer.hasLockedColumns` to ensure pristine 0-JS overhead when developers configure a traditional single-body Grid layout, gracefully defaulting to legacy SCSS native behavior.

## Timeline

- 2026-04-02T09:27:55Z @tobiu added the `enhancement` label
- 2026-04-02T09:27:56Z @tobiu added the `ai` label
- 2026-04-02T09:27:56Z @tobiu added the `performance` label
- 2026-04-02T09:27:56Z @tobiu added the `grid` label
- 2026-04-02T09:28:02Z @tobiu added parent issue #9626
- 2026-04-02T09:57:17Z @tobiu referenced in commit `e831999` - "feat: Optimized Multi-Body Grid RowHoverSync Addon (#9630)"
### @tobiu - 2026-04-02T09:57:35Z

Development is complete. Hover sync has been stabilized by aggressively removing `.neo-hover` artifact classes natively, moving to a fully event-driven workflow (using `resumeHover` with `timeout()`), and documenting the architecture following the 'Anchor & Echo' Knowledge Base Enhancement Strategy. Changes have been pushed to `dev`.

- 2026-04-02T09:57:46Z @tobiu assigned to @tobiu
- 2026-04-02T09:57:49Z @tobiu closed this issue
- 2026-04-02T10:02:44Z @tobiu referenced in commit `22e2ac7` - "refactor: Alphabetize GridRowHoverSync methods and rename ambiguous ScrollManager variables (#9630)"
- 2026-04-02T10:05:12Z @tobiu referenced in commit `88a1563` - "refactor: apply let me = this convention to ScrollManager (#9630)"

