---
id: 9629
title: 'Grid Multi-Body: Implement Atomic VDOM Orchestration Layer'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T08:19:56Z'
updatedAt: '2026-04-02T08:41:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9629'
author: tobiu
commentsCount: 1
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-02T08:41:31Z'
---
# Grid Multi-Body: Implement Atomic VDOM Orchestration Layer

The final phase to eliminate jitter by centralizing delta updates.
- Refactor the `createViewData` calculation loops to be driven top-down by `grid.View`, rather than independently by each `grid.Body`.
- Implement a silent update mechanism across all active child bodies, followed by a single orchestrated VDOM `update()` call on the `grid.View` (using `updateDepth: 2` or similar logical depth) to sync them atomically.
- Adjust Main Thread Addons (such as `ScrollManager`, `GridRowScrollPinning`, etc.) to register and synchronize with the new unified vertical scroll node.

## Timeline

- 2026-04-02T08:19:56Z @tobiu assigned to @tobiu
- 2026-04-02T08:19:58Z @tobiu added the `enhancement` label
- 2026-04-02T08:19:58Z @tobiu added the `ai` label
- 2026-04-02T08:19:59Z @tobiu added the `grid` label
- 2026-04-02T08:20:07Z @tobiu added parent issue #9626
- 2026-04-02T08:41:14Z @tobiu referenced in commit `d820537` - "feat: Implement Atomic VDOM Sync & Orchestration for scrolling (#9629)"
### @tobiu - 2026-04-02T08:41:29Z

Implemented atomic VDOM synchronization by migrating  to generate silent nested updates, followed by an orchestrated depth=-1 update from . This effectively resolves the scroll jitter by emitting a perfectly aligned unified delta patch.

- 2026-04-02T08:41:31Z @tobiu closed this issue
- 2026-04-02T08:53:12Z @tobiu referenced in commit `edd44de` - "fix: removed deprecated updateVerticalScrollSyncAddon call in GridContainer (#9629)"

