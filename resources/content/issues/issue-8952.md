---
id: 8952
title: 'Bug: Dynamic Worker Start triggers Double App Init & Canvas Race Condition'
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-02-02T21:30:47Z'
updatedAt: '2026-02-02T21:30:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8952'
author: tobiu
commentsCount: 0
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

