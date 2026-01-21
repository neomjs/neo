---
id: 8809
title: Fix SharedCanvas destroy lifecycle to ensure graph cleanup
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-19T12:25:53Z'
updatedAt: '2026-01-19T12:28:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8809'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T12:28:57Z'
---
# Fix SharedCanvas destroy lifecycle to ensure graph cleanup

The `Portal.view.shared.Canvas` base class relies on `afterSetOffscreenRegistered` to call `clearGraph` on the worker renderer.
However, `offscreenRegistered` is only set to `false` in `Neo.component.Canvas` when `mounted` changes to `false`.
When a component is destroyed directly (e.g. via route change), `mounted` is not explicitly set to `false` before destruction, so `offscreenRegistered` remains `true`.
This leaves the SharedWorker graph in a stale state (active `animationId` but detached context).
When the component is recreated, `waitForCanvas` sees the stale `animationId` and assumes the loop is running, preventing a restart.

**Fix:**
Override `destroy()` in `Portal.view.shared.Canvas` to explicitly call `this.renderer.clearGraph()`. This ensures cleanup regardless of the mount state.

## Timeline

- 2026-01-19T12:25:54Z @tobiu added the `bug` label
- 2026-01-19T12:25:54Z @tobiu added the `ai` label
- 2026-01-19T12:25:55Z @tobiu added the `regression` label
### @tobiu - 2026-01-19T12:28:37Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `destroy()` override in `Portal.view.shared.Canvas` to explicitly call `renderer.clearGraph()`. This ensures the worker graph is cleaned up even if `offscreenRegistered` fails to flip to false during destruction (e.g. rapid view replacement).

- 2026-01-19T12:28:41Z @tobiu assigned to @tobiu
- 2026-01-19T12:28:45Z @tobiu referenced in commit `7ac2a02` - "fix: SharedCanvas destroy lifecycle to ensure graph cleanup (#8809)

Added override for destroy() in SharedCanvas to explicitly call renderer.clearGraph(). This prevents stale worker loops when a view is destroyed without a prior unmount event (e.g., during direct route replacement)."
- 2026-01-19T12:28:57Z @tobiu closed this issue

