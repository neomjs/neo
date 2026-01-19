---
id: 8801
title: Implement generic async destruction handling via Promise Rejection
state: OPEN
labels:
  - ai
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T09:29:59Z'
updatedAt: '2026-01-19T09:30:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8801'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement generic async destruction handling via Promise Rejection

Currently, `core.Base.timeout` promises hang forever if the component is destroyed before completion, causing memory leaks (async closures never GC'd). Manual `isDestroyed` checks after awaits are brittle.

Plan:
1.  Add `Neo.DESTROYED` constant.
2.  Add global `unhandledrejection` handler to suppress `Neo.DESTROYED` errors.
3.  Update `core.Base`:
    - Track `timeout` reject functions.
    - In `destroy()`, reject all pending timeouts with `Neo.DESTROYED`.
4.  Remove manual guards from `MagicMoveText` as a verification step.

## Timeline

- 2026-01-19T09:30:00Z @tobiu added the `ai` label
- 2026-01-19T09:30:00Z @tobiu added the `architecture` label
- 2026-01-19T09:30:00Z @tobiu added the `performance` label
- 2026-01-19T09:30:00Z @tobiu added the `core` label
- 2026-01-19T09:30:16Z @tobiu assigned to @tobiu

