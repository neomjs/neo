---
id: 9503
title: 'TimelineCanvas regression: Canvas not showing due to SharedCanvas getCanvasId() mismatch with componentId'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-17T18:20:20Z'
updatedAt: '2026-03-17T18:21:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9503'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-17T18:21:16Z'
---
# TimelineCanvas regression: Canvas not showing due to SharedCanvas getCanvasId() mismatch with componentId

When fixing issue #9479 to implement Triangular Communication for OffscreenCanvas transfers, we changed how `Canvas.mjs` registers callbacks.
Previously, it relied purely on the `nodeId` in `Neo.main.DomAccess.transferCanvasToWorker({nodeId})`.
However, `SharedCanvas` overrides `getCanvasId()` to return the inner `<canvas>` tag's id, whereas `me.id` refers to the `div` wrapper.
Because we didn't pass `componentId` down through the triangular communication (`Main` -> `Canvas Worker` -> `App Worker`), `onCanvasRegistered({nodeId})` in `worker/App.mjs` was using `nodeId` (the inner canvas) to look up the component via `Neo.get()`. This lookup failed for `SharedCanvas` instances like `TimelineCanvas`, because their `componentId` is different from the `nodeId` of the `<canvas>` tag.
This PR fixes the issue by explicitly passing `componentId` from `Canvas.mjs` to `Main`, then to `Canvas Worker`, and back to `App Worker`, ensuring `Neo.get(componentId)` resolves correctly.

## Timeline

- 2026-03-17T18:20:21Z @tobiu added the `bug` label
- 2026-03-17T18:20:21Z @tobiu added the `ai` label
- 2026-03-17T18:20:32Z @tobiu assigned to @tobiu
- 2026-03-17T18:20:48Z @tobiu referenced in commit `481fddf` - "bug: Fix TimelineCanvas regression by passing componentId through triangular communication (#9503)"
- 2026-03-17T18:21:16Z @tobiu closed this issue

