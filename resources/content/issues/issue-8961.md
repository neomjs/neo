---
id: 8961
title: 'Fix: Memory Leak in Neo.component.Canvas due to missing destroy()'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T13:01:21Z'
updatedAt: '2026-02-03T13:12:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8961'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T13:12:00Z'
---
# Fix: Memory Leak in Neo.component.Canvas due to missing destroy()

`Neo.component.Canvas` is missing a `destroy()` method. While it correctly registers the canvas with the worker on mount, it fails to unregister it on destruction.

**Consequence:**
The Canvas Worker retains `OffscreenCanvas` contexts, render loops, and data structures indefinitely, leading to a memory leak and potential GPU process crash over time as views are created and destroyed.

**Task:**
1.  Implement `destroy()` in `src/component/Canvas.mjs`.
2.  Send a `destroyCanvas` (or similar unregister) message to the Canvas Worker.
3.  Implement the corresponding `destroyCanvas` handler in `src/worker/Canvas.mjs` (and specifically in `src/canvas/Sparkline.mjs` if it maintains its own map) to clean up the internal state and stop render loops.

## Timeline

- 2026-02-03T13:01:22Z @tobiu added the `bug` label
- 2026-02-03T13:01:22Z @tobiu added the `ai` label
- 2026-02-03T13:01:53Z @tobiu added parent issue #8930
- 2026-02-03T13:10:42Z @tobiu referenced in commit `05a855c` - "Fix: Memory Leak in Neo.component.Canvas due to missing destroy() (#8961)"
### @tobiu - 2026-02-03T13:10:55Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the memory leak in `Neo.component.Canvas` and `Neo.component.Sparkline`.
> 
> **Changes:**
> 1.  **`src/worker/Canvas.mjs`**: Added `unregisterCanvas` to remove canvas references from the worker's internal map.
> 2.  **`src/component/Canvas.mjs`**:
>     -   Implemented `destroy()` to call `unregisterCanvas` if the canvas was registered.
>     -   Updated `afterSetMounted()` to call `unregisterCanvas` when the component is unmounted (value === false).
> 3.  **`src/canvas/Sparkline.mjs`**:
>     -   Added `unregister` remote method to cleanup the renderer's specific state (active render loops, item maps).
> 4.  **`src/component/Sparkline.mjs`**:
>     -   Implemented `destroy()` to call `renderer.unregister`.
>     -   Updated `afterSetMounted()` to call `renderer.unregister` on unmount.
> 
> **Outcome:**
> `OffscreenCanvas` contexts and worker-side render loops are now properly cleaned up when a component is destroyed or unmounted (e.g., via `removeDom: true`). This prevents memory leaks and ensures long-term stability.

- 2026-02-03T13:11:47Z @tobiu assigned to @tobiu
- 2026-02-03T13:12:00Z @tobiu closed this issue

