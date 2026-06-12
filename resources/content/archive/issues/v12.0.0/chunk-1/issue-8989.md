---
id: 8989
title: 'perf: Implement atomic Grid Body updates via explicit suspension flag'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-04T18:46:03Z'
updatedAt: '2026-02-04T19:19:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8989'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T19:19:04Z'
---
# perf: Implement atomic Grid Body updates via explicit suspension flag

## Context
Changing multiple configs that affect the view (e.g., `scrollLeft` and `scrollTop` during diagonal scrolling) triggers multiple `createViewData` -> `update` calls in the same tick.

## Solution
1.  **ScrollManager:** Consolidate the DOM updates into a single, atomic operation using `syncGridBody`.
2.  **Grid Body:** Implement a `skipCreateViewData` flag guard in `createViewData`.

## Changes
1.  **Refactor ScrollManager:**
    *   Create `syncGridBody` (throttle: 16ms) in `delayable`.
    *   Update `onBodyScroll` and `onContainerScroll` to update local state and call `me.syncGridBody()`.
    *   Implement `syncGridBody` to use the suspend/resume pattern:
        ```javascript
        this.gridBody.skipCreateViewData = true;
        this.gridBody.set({scrollLeft, scrollTop});
        this.gridBody.skipCreateViewData = false;
        this.gridBody.createViewData();
        ```
2.  **Modify Grid Body:**
    *   Add `if (me.skipCreateViewData) return;` to `createViewData`.

## Expected Result
Smoother diagonal scrolling and reduced `update()` cycles on the Grid Body, without the latency of buffering.

## Timeline

- 2026-02-04T18:46:03Z @tobiu added the `enhancement` label
- 2026-02-04T18:46:04Z @tobiu added the `performance` label
- 2026-02-04T18:46:04Z @tobiu added the `core` label
- 2026-02-04T18:46:17Z @tobiu assigned to @tobiu
- 2026-02-04T18:51:14Z @tobiu changed title from **perf: Buffer createViewData in grid.Body to coalesce updates** to **perf: Implement atomic Grid Body updates via explicit suspension flag**
- 2026-02-04T19:17:31Z @tobiu referenced in commit `2892f7e` - "perf: Implement atomic Grid Body updates via explicit suspension flag (#8989)"
### @tobiu - 2026-02-04T19:17:42Z

**Input from Gemini 3 Pro:**

> ✦ Implemented atomic Grid Body updates to optimize diagonal scrolling.
> 
> **Changes:**
> 1.  **Refactored `ScrollManager`:**
>     *   Added `syncGridBody` to `delayable` (throttled 16ms).
>     *   Refactored `onBodyScroll` and `onContainerScroll` to update local state (`scrollTop`/`scrollLeft`) and trigger `syncGridBody` immediately (removed their own throttles to prevent message queue flooding/latency mismatch).
>     *   Implemented `syncGridBody` using the suspend/resume pattern via `skipCreateViewData` to ensure atomic application of both coordinates.
> 2.  **Modified `GridBody`:**
>     *   Added `if (me.skipCreateViewData) return;` guard to `createViewData` to support the suspension pattern.
> 
> This ensures that simultaneous X and Y scroll events result in a single, synchronized VDOM update cycle.

- 2026-02-04T19:18:44Z @tobiu added the `ai` label
- 2026-02-04T19:19:04Z @tobiu closed this issue

