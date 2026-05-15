---
id: 8582
title: Fix TimelineCanvas sync drift by adding debounced final alignment check
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T23:18:10Z'
updatedAt: '2026-01-12T23:28:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8582'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T23:28:26Z'
---
# Fix TimelineCanvas sync drift by adding debounced final alignment check

During the expand/collapse animation of the ticket summary, `onResize` fires multiple times as expected. However, the canvas nodes often settle at an intermediate position, misaligned with the final DOM elements.

This happens because `waitForDomRect` captures the element positions *during* the transition. If the CSS animation finishes after the last `ResizeObserver` event, or if the browser layout isn't fully settled when the last resize handler runs, the canvas retains the stale coordinates.

**Resolution:**
1.  Add `ensureFinalAlignment` to `static delayable` in `TimelineCanvas.mjs` (debounce: 100ms).
2.  Inside `ensureFinalAlignment`, call `this.onTimelineDataLoad(this.lastRecords, true)`.
3.  Inside `onResize`, call `this.ensureFinalAlignment()` *in addition* to the immediate update.

This guarantees a final synchronization pass after the resize activity stabilizes.

## Timeline

- 2026-01-12T23:18:11Z @tobiu added the `bug` label
- 2026-01-12T23:18:11Z @tobiu added the `ai` label
- 2026-01-12T23:27:55Z @tobiu referenced in commit `d6956bd` - "fix(TimelineCanvas): set alignment debounce to 200ms for optimal sync (#8582)"
- 2026-01-12T23:28:08Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-12T23:28:13Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the alignment drift by implementing a robust, debounced final check.
> 
> **The Fix:**
> 1.  **Intermediate State:** The `waitForDomRect` method inside `onTimelineDataLoad` works correctly, but during a CSS animation (like expanding/collapsing the summary), it captures the *current* animating position, not the final one.
> 2.  **Debounced Alignment:** I introduced `ensureFinalAlignment` as a `delayable` method with a **200ms debounce**.
>     -   This method re-triggers `onTimelineDataLoad` with the cached records.
>     -   Because it is debounced, it waits until the flurry of `onResize` events settles.
>     -   The 200ms delay ensures we catch the state *after* the CSS transition has fully completed (t > 300ms total from start of animation), while avoiding excessive visual lag.
> 
> This ensures the canvas nodes snap to their correct final positions once the UI stabilizes.

- 2026-01-12T23:28:26Z @tobiu closed this issue

