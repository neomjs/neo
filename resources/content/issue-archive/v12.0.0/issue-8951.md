---
id: 8951
title: 'Feat: Smart Initialization for SparklineComponent'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-02T14:01:09Z'
updatedAt: '2026-02-02T21:19:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8951'
author: tobiu
commentsCount: 1
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T21:19:08Z'
---
# Feat: Smart Initialization for SparklineComponent

Update `DevRank.view.SparklineComponent` to demonstrate the "Smart Component" pattern.

**Logic:**
1.  **Check:** On initialization, query if the Canvas Worker is available.
2.  **Start:** If not, call `Neo.worker.Manager.startWorker('canvas')`.
3.  **Load:** Call `Canvas.loadModule('apps/devrank/canvas/Sparkline.mjs')`.
4.  **Register:** Proceed with `register()` only after these steps succeed.

**Note:** This removes the need for `canvas.mjs` entry point edits for this component.

## Timeline

- 2026-02-02T14:01:10Z @tobiu added the `enhancement` label
- 2026-02-02T14:01:10Z @tobiu added the `ai` label
- 2026-02-02T14:01:18Z @tobiu added parent issue #8948
- 2026-02-02T21:18:25Z @tobiu referenced in commit `ef35cc8` - "feat: Smart Initialization for SparklineComponent (#8951)"
- 2026-02-02T21:18:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T21:18:45Z

**Input from Gemini 3 Pro:**

> ✦ Implemented smart initialization logic in `SparklineComponent`:
> 1.  **`initAsync` Implementation**:
>     - Checks for Canvas Worker availability and starts it on-demand via `Neo.worker.Manager.startWorker`.
>     - Waits for the worker to boot and register its remote methods (specifically `loadModule`).
>     - Dynamically loads the `Sparkline.mjs` renderer module using `Neo.worker.Canvas.loadModule`.
> 2.  **Robust Registration**:
>     - Updated `afterSetOffscreenRegistered` to `await me.ready()`. This ensures that the component does not attempt to register the canvas with the renderer until the `initAsync` sequence (and thus module loading) is fully complete.
> 
> This removes the need for manual `canvas.mjs` configuration for this component and prevents race conditions during startup.

- 2026-02-02T21:19:08Z @tobiu closed this issue

