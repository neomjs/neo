---
id: 8988
title: 'bug: rewrite throttle utility to robustly handle trailing edge'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-04T17:47:36Z'
updatedAt: '2026-02-04T18:18:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8988'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T18:18:06Z'
---
# bug: rewrite throttle utility to robustly handle trailing edge

## Context
The current `throttle` implementation in `src/util/Function.mjs` has two issues:
1.  **Inefficiency:** It clears and recreates `setTimeout` on every call during the cooldown period solely to capture the latest arguments.
2.  **Fragility:** It relies on a strict timing check `(Date.now() - lastRanDate) >= delay` inside the timeout. If the browser fires the timeout even 1ms early (common jitter), the trailing call is silently dropped.

## Objective
Rewrite `throttle` to use a standard, robust pattern:
1.  **Leading Edge:** Execute immediately if `now - lastRun > delay`.
2.  **Trailing Edge:** If inside cooldown, store the `latestArgs`. Schedule a SINGLE timeout for the remaining time if one doesn't exist.
3.  **Execution:** When the timeout fires, execute with `latestArgs`, update `lastRun`, and clear the timeout flag.

This ensures `ScrollManager` (and other components) never lose the final update event, preventing visual desyncs.

## Timeline

- 2026-02-04T17:47:38Z @tobiu added the `bug` label
- 2026-02-04T17:47:38Z @tobiu added the `core` label
- 2026-02-04T17:48:07Z @tobiu assigned to @tobiu
- 2026-02-04T18:10:30Z @tobiu referenced in commit `75c6c19` - "bug: rewrite throttle utility to robustly handle trailing edge (#8988)"
### @tobiu - 2026-02-04T18:16:08Z

**Input from Gemini 3 Pro:**

> ✦ Rewrote `throttle` utility to implement a robust **Fixed-Rate** pattern with **Leading & Trailing Edge** support.
> 
> **Key Changes:**
> 1.  **State Tracking:** Introduced `lastRan` timestamp and `timeoutId` handle.
> 2.  **Leading Edge:** Executes immediately if the cooldown period (`delay`) has passed.
> 3.  **Persistent Timer:** During the cooldown window, a single `setTimeout` is scheduled for the *remaining* time (`delay - elapsed`). This avoids the fragility of clearing/recreating timers.
> 4.  **Trailing Edge:** The persistent timer captures the latest arguments (`lastArgs`) and executes them once the cooldown expires, ensuring the final event (e.g., scroll stop) is never dropped.
> 5.  **Fixed-Rate Precision:** By calculating `remaining` time, we maintain a consistent execution frequency (e.g., 60fps) rather than drifting by adding delay *after* execution.
> 
> This fixes the issue where strict timing checks in the previous implementation could silently drop trailing calls due to browser timer jitter.

- 2026-02-04T18:17:48Z @tobiu added the `ai` label
- 2026-02-04T18:18:06Z @tobiu closed this issue

