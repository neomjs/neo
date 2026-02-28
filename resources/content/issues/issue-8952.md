---
id: 8952
title: 'Bug: Dynamic Worker Start triggers Double App Init & Canvas Race Condition'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-02T21:30:47Z'
updatedAt: '2026-02-02T21:39:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8952'
author: tobiu
commentsCount: 2
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T21:36:03Z'
---
# Bug: Dynamic Worker Start triggers Double App Init & Canvas Race Condition

**Issue 1: Double Application Initialization**
In `src/worker/Manager.mjs`, the `onWorkerConstructed` method checks `me.constructedThreads === me.activeWorkers + 1` to decide when to call `me.loadApplication()`.
When `startWorker()` is called dynamically:
1. `me.activeWorkers` is incremented.
2. The new worker constructs and sends a message.
3. `me.constructedThreads` is incremented.
4. The equality check passes AGAIN (e.g., 5 === 4 + 1), causing `loadApplication()` to run a second time.

**Issue 2: Sparkline Race Condition**
`Neo.component.Canvas` (base class) calls `Neo.worker.Canvas.registerCanvas` in `afterSetMounted`.
When using dynamic workers, `initAsync` (which starts the worker) might still be running when `afterSetMounted` fires.
This leads to `TypeError: Cannot read properties of undefined (reading 'registerCanvas')` because the remote method hasn't been registered yet.

**Proposed Fixes:**
1. **Manager:** Add a `applicationLoaded` flag to prevent multiple `loadApplication` calls.
2. **SparklineComponent:** Override `afterSetMounted` to `await this.ready()` before calling `super.afterSetMounted()`.

## Timeline

- 2026-02-02T21:30:49Z @tobiu added the `bug` label
- 2026-02-02T21:30:49Z @tobiu added the `ai` label
- 2026-02-02T21:31:38Z @tobiu added parent issue #8948
- 2026-02-02T21:35:24Z @tobiu referenced in commit `827e43e` - "fix: Resolve Dynamic Worker race conditions and double app init (#8952)"
- 2026-02-02T21:35:33Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T21:35:44Z

**Input from Gemini 3 Pro:**

> ✦ Resolved two critical issues with dynamic worker initialization:
> 
> 1.  **Double Application Initialization:**
>     - **Cause:** `startWorker` incremented `activeWorkers`, causing the `constructedThreads === activeWorkers + 1` check in `onWorkerConstructed` to pass a second time (e.g., 5 === 4+1), triggering `loadApplication` again.
>     - **Fix:** Added `applicationLoaded` flag to `src/worker/Manager.mjs` to ensure `loadApplication` is called exactly once.
> 
> 2.  **Sparkline Initialization Race Condition:**
>     - **Cause:** `initAsync` (which starts the worker) and `afterSetMounted` (which registers the canvas) were racing. The base `afterSetMounted` would call `registerCanvas` before `initAsync` completed (worker booting + remote registration).
>     - **Fix:** Overrode `afterSetMounted` in `SparklineComponent.mjs` to `await this.ready()` *before* calling `super.afterSetMounted()`. This enforces strict ordering: the component waits for `initAsync` (and thus the worker start + module load) to finish before attempting registration.

- 2026-02-02T21:36:03Z @tobiu closed this issue
- 2026-02-02T21:37:24Z @tobiu referenced in commit `e3fd79d` - "#8952 removed useCanvasWorker from the devrank neo-config.json"
### @tobiu - 2026-02-02T21:39:14Z

**Input from Gemini 3 Pro:**

> ✦ **Context:** The issues resolved here (Double App Init & Race Condition) were triggered specifically when removing `useCanvasWorker: true` from `apps/devrank/neo-config.json`.
> 
> This confirmed that the "Dynamic Worker" architecture (Epic #8948) works as intended:
> 1.  The App starts *without* the Canvas Worker (saving resources).
> 2.  When `SparklineComponent` mounts, it *dynamically* starts the Canvas Worker.
> 3.  The fixes in this ticket ensure this late-binding process is smooth and doesn't re-trigger application load logic.
> 
> The goal of "Zero-Config" usage for worker-based components is now achieved.


