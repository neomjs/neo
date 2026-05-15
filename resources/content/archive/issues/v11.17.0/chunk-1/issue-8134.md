---
id: 8134
title: Fix infinite recursion in mount() when useVdomWorker is false
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-17T01:54:27Z'
updatedAt: '2025-12-17T02:01:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8134'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T02:01:17Z'
---
# Fix infinite recursion in mount() when useVdomWorker is false

The recent refactoring of `mount()` to `return initVnode(true)` introduced a regression when `Neo.config.useVdomWorker` is set to `false`.

**The Issue:**
1.  **Remote Execution (Standard):** When `useVdomWorker` is `true`, `Neo.vdom.Helper.create` is accessed via Remote Method Access (RMA). The VDom worker executes the method and sends a `reply` message. The `Neo.worker.Manager` in the main thread intercepts this reply, detects `autoMount: true`, and applies the DOM deltas before forwarding the reply to the App worker.
2.  **Local Execution (No Worker):** When `useVdomWorker` is `false`, `Helper.create` runs locally in the App Worker. It returns a plain object directly. No worker messages are generated, so the Manager never intercepts the result to update the DOM.
3.  **Recursion:** The previous code handled this by calling `me.mount()`. Since `mount()` was refactored to call `initVnode(true)`, this created an infinite loop.

**The Fix:**
We need to manually trigger the DOM update inside `initVnode` when running locally.

**Task:**
Modify `src/mixin/VdomLifecycle.mjs`:
*   In `initVnode()`, remove the recursive call `autoMount && !useVdomWorker && me.mount()`.
*   Replace it with logic that explicitly constructs the `insertNode` delta (using the data returned from `Helper.create`) and sends it to the main thread via `Neo.applyDeltas`.

This restores the mounting functionality for the non-worker VDOM configuration without relying on the now-circular `mount()` method.

## Timeline

- 2025-12-17T01:54:28Z @tobiu added the `bug` label
- 2025-12-17T01:54:28Z @tobiu added the `ai` label
- 2025-12-17T02:00:41Z @tobiu assigned to @tobiu
- 2025-12-17T02:00:56Z @tobiu referenced in commit `6fe072a` - "Fix infinite recursion in mount() when useVdomWorker is false (#8134)"
- 2025-12-17T02:01:17Z @tobiu closed this issue

