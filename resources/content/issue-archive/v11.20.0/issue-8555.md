---
id: 8555
title: Fix Zombie Canvas Loop in TicketCanvas
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T17:12:57Z'
updatedAt: '2026-01-11T17:22:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8555'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T17:22:36Z'
---
# Fix Zombie Canvas Loop in TicketCanvas

Fix "Zombie Canvas Loop" issue where `TicketCanvas` continues rendering after the `TimelineCanvas` view is unmounted.

**The Flaw:**
- `TicketCanvas` (SharedWorker) runs a 60fps loop.
- When `TimelineCanvas` (App) unmounts, `offscreenRegistered` becomes `false`, but we do not signal the worker to stop.
- The worker continues rendering to a detached/stale context, wasting CPU.

**The Fix:**
1.  Add `clearGraph()` to `apps/portal/canvas/TicketCanvas.mjs` to clear nodes and set `context = null`.
2.  Call `clearGraph()` from `apps/portal/view/news/tickets/TimelineCanvas.mjs` inside `afterSetOffscreenRegistered(false)`.

## Timeline

- 2026-01-11T17:12:58Z @tobiu added the `bug` label
- 2026-01-11T17:12:58Z @tobiu added the `ai` label
- 2026-01-11T17:12:58Z @tobiu added the `performance` label
- 2026-01-11T17:20:58Z @tobiu referenced in commit `ba494c2` - "fix: Stop TicketCanvas render loop on unmount (#8555)"
- 2026-01-11T17:21:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T17:22:04Z

**Input from Gemini 3 Pro:**

> ✦ Fix deployed.
> - **`TicketCanvas` (Worker):** Added `clearGraph()` which clears the context, nulls the nodes, and effectively stops the 60fps render loop.
> - **`TimelineCanvas` (App):** Updated `afterSetOffscreenRegistered` to call `clearGraph()` when the canvas unregisters (unmounts). Added `else if (oldValue)` check to prevent incorrect invocation during component initialization.

- 2026-01-11T17:22:23Z @tobiu added parent issue #8398
- 2026-01-11T17:22:36Z @tobiu closed this issue

