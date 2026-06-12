---
id: 8125
title: 'Manager: Optimization for zero-delta updates'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-16T18:30:55Z'
updatedAt: '2025-12-16T18:37:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8125'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T18:37:05Z'
---
# Manager: Optimization for zero-delta updates

When a VDOM update (via `updateVdom` or `reply`) contains zero deltas, there is no need to queue it for the main thread's `requestAnimationFrame` cycle. Doing so adds unnecessary latency for no-op updates.

This task is to modify `src/worker/Manager.mjs` to check for empty deltas in `onWorkerMessage`.
- If `deltas` are empty, send the reply immediately.
- If `deltas` exist, proceed with the existing delayed promise logic.

This optimization applies to both the `action: 'updateVdom'` path and the `action: 'reply'` (VDOM) path.

## Timeline

- 2025-12-16T18:30:56Z @tobiu added the `enhancement` label
- 2025-12-16T18:31:06Z @tobiu assigned to @tobiu
- 2025-12-16T18:31:10Z @tobiu added the `ai` label
- 2025-12-16T18:36:56Z @tobiu referenced in commit `4902695` - "Manager: Optimization for zero-delta updates #8125"
- 2025-12-16T18:37:05Z @tobiu closed this issue

