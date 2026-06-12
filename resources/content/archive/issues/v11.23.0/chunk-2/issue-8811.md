---
id: 8811
title: Fix Canvas Remount Race Condition by Retrying getOffscreenCanvas
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-19T13:24:48Z'
updatedAt: '2026-01-19T14:02:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8811'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T13:27:37Z'
---
# Fix Canvas Remount Race Condition by Retrying getOffscreenCanvas

- **Problem**: When a Canvas component is reused (unmounted and remounted), `afterSetMounted` triggers `getOffscreenCanvas`. If this runs before the VDOM worker has patched the DOM (creating the node), `DomAccess` returns `success: false`, causing `offscreenRegistered` to remain `false` and the canvas initialization to fail.
- **Root Cause**: The 30ms timeout in `Neo.component.Canvas.afterSetMounted` is insufficient in some race conditions (e.g. heavy main thread load or specific navigation flows).
- **Solution**: Implement a retry mechanism in `Neo.component.Canvas.afterSetMounted`. If `getOffscreenCanvas` fails (returns `success: false`), wait and try again (e.g., up to 5 times with 50ms delay) before giving up.

## Timeline

- 2026-01-19T13:24:49Z @tobiu added the `bug` label
- 2026-01-19T13:24:49Z @tobiu added the `ai` label
- 2026-01-19T13:24:50Z @tobiu added the `regression` label
- 2026-01-19T13:27:03Z @tobiu referenced in commit `25d8c26` - "fix: Robustify Canvas.afterSetMounted with retries for getOffscreenCanvas (#8811)"
- 2026-01-19T13:27:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T13:27:16Z

**Input from Gemini 3 Pro:**

> ✦ Implemented a robust retry mechanism in `Neo.component.Canvas.afterSetMounted`.
> 
> When a component is reused, the App Worker might trigger `afterSetMounted(true)` before the new DOM node is fully established in the Main Thread. This caused `getOffscreenCanvas` to fail (node not found), leaving `offscreenRegistered` as `false` and preventing the animation loop from starting.
> 
> The fix adds a loop that attempts to get the offscreen canvas up to 5 times with a 50ms delay if the initial call returns `success: false`. This ensures reliable initialization even under heavy load or race conditions.

- 2026-01-19T13:27:38Z @tobiu closed this issue
- 2026-01-19T13:55:11Z @tobiu referenced in commit `1672ca0` - "fix: Prevent phantom mounts in NewsTabContainer and robustify Canvas initialization (#8811)"
### @tobiu - 2026-01-19T13:55:25Z

**Input from Gemini 3 Pro:**

> ✦ Refined the solution to address the root cause of "phantom mounts" and further harden the Canvas initialization.
> 
> **1. Root Cause Analysis:**
> When navigating away from `News` and back, `NewsTabContainer` momentarily restored its previous `activeIndex` (e.g., Tickets) before the Router updated it to the default (Releases). This caused the Tickets view (and `TimelineCanvas`) to mount and immediately unmount, triggering a race condition where `getOffscreenCanvas` failed because the DOM node was removed before it could be registered.
> 
> **2. Architecture Fix (`NewsTabContainer`):**
> Implemented `afterSetMounted` in `apps/portal/view/news/TabContainer.mjs` to reset `activeIndex` to `null` whenever the container unmounts. This ensures that on the next mount, the container starts in a clean state and only renders the tab explicitly requested by the Router, preventing the phantom mount cycle.
> 
> **3. Robustness Fix (`Neo.component.Canvas`):**
> Replaced the fixed retry count with a robust `while` loop that polls for `getOffscreenCanvas` as long as `me.mounted` is true. This handles:
> -   **Premature/Phantom Mounts:** If the component unmounts during initialization (like in the bug scenario), `me.mounted` flips to `false`, and the loop exits gracefully without error.
> -   **Slow DOM Updates:** If the DOM node takes longer than expected to appear, the loop waits indefinitely (until success or unmount), preventing initialization failures due to timeouts.
> 
> This dual approach fixes the specific regression while making the framework more resilient to similar timing issues in the future.

- 2026-01-19T14:01:38Z @tobiu referenced in commit `21563bc` - "fix: Use exponential back-off for offscreen canvas polling (#8811)"
### @tobiu - 2026-01-19T14:02:34Z

**Input from Gemini 3 Pro:**

> ✦ Optimized the polling mechanism in `Neo.component.Canvas` to use an exponential back-off strategy.
> 
> Instead of a fixed 50ms interval, the polling loop now starts at 50ms and doubles the delay after each failed attempt, capping at 1000ms.
> 
> **Benefits:**
> -   **Immediate Responsiveness:** Still catches the DOM node appearing quickly (typical case).
> -   **Resource Efficiency:** Significantly reduces CPU overhead if the component enters a "zombie mount" state (mounted but DOM missing) or if the DOM update is severely delayed, scaling back to a 1Hz check.
> -   **Self-Healing:** Continues to check (at a low frequency) indefinitely as long as the component thinks it is mounted, ensuring that if the DOM eventually recovers (e.g. parent becomes visible), the canvas will initialize.


