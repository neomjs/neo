---
id: 8576
title: Investigate 'requestAnimationFrame' violations (55ms+)
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-12T03:09:41Z'
updatedAt: '2026-01-12T04:53:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8576'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T04:53:19Z'
---
# Investigate 'requestAnimationFrame' violations (55ms+)

**Issue:**
Following recent core changes, the console is reporting `[Violation] 'requestAnimationFrame' handler took 55ms`. This indicates a regression in the main thread's rendering performance.

**Goal:**
1. Investigate `src/Main.mjs` and `src/main/DeltaUpdates.mjs` to identify bottlenecks.
2. Instrument the code with performance logging (`console.time`/`timeEnd` or `performance.now()`) to isolate the slow operations.
3. Analyze the logs to determine if the issue is in VDOM parsing, DOM patching, or message handling.


## Timeline

- 2026-01-12T03:09:42Z @tobiu added the `bug` label
- 2026-01-12T03:09:42Z @tobiu added the `ai` label
- 2026-01-12T03:09:43Z @tobiu added the `performance` label
- 2026-01-12T04:52:24Z @tobiu referenced in commit `36c5c40` - "perf(DeltaUpdates): Implement DocumentFragment batching for contiguous insertNode operations (#8576)"
### @tobiu - 2026-01-12T04:52:27Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented a **Batching Strategy** for `insertNode` operations in `src/main/DeltaUpdates.mjs`.
> 
> **The Solution:**
> Contiguous `insertNode` operations targeting the same parent are now grouped into a single `DocumentFragment`. This batch is built in a detached state and inserted into the live DOM in a **single atomic operation**.
> 
> **Performance Impact:**
> -   **Reduced Reflows:** Instead of 300+ individual insertions triggering layout calculations, we now have 1 reflow per batch.
> -   **Stability:** We experimented with "Time Slicing" (generators) but found that the overhead and complexity outweighed the benefits for the initial viewport render (which takes ~60ms synchronously). The "blank page" risk of async rendering was deemed too high.
> -   **Result:** The "slow operation" warning for large lists (e.g., 300 items) is now contained to ~40ms, which is within acceptable limits for a synchronous main thread operation.
> 
> **Status:**
> -   Time-slicing logic has been reverted.
> -   Performance logging has been removed.
> -   Batching logic is active and verified.
> 
> Ready for final review.

- 2026-01-12T04:53:17Z @tobiu assigned to @tobiu
- 2026-01-12T04:53:19Z @tobiu closed this issue

