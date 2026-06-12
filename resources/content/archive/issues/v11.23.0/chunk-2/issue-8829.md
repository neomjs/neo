---
id: 8829
title: Fix VDOM Merge Race Condition during In-Flight Updates
state: CLOSED
labels:
  - bug
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T16:03:57Z'
updatedAt: '2026-01-20T16:05:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8829'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T16:05:52Z'
---
# Fix VDOM Merge Race Condition during In-Flight Updates

This ticket addresses a race condition where child components correctly registered for a merged update, but their request was lost if the parent component was *already* in the middle of executing its update cycle.

**The Problem:**
1.  **Parent** starts a VDOM update (`isVdomUpdating = true`).
2.  **Parent** captures the current list of merged children (`getMergedChildIds`).
3.  **Child** (running in parallel) attempts to update. It sees the Parent is updating and registers itself to be merged (`mergeIntoParentUpdate`).
4.  **Parent** finishes its update cycle. `resolveVdomUpdate` calls `executeCallbacks`.
5.  **Critically**, `executeCallbacks` blindly cleared *all* pending merges for that parent, assuming they were all handled.
6.  The **Child's** "late" merge request (which was *not* in the Parent's initial snapshot) was deleted without being processed.

**The Solution:**
1.  **Snapshot Tracking:** `VdomLifecycle.executeVdomUpdate` now captures the *exact* set of child IDs included in the update payload.
2.  **Precise Resolution:** This snapshot is passed to `resolveVdomUpdate` and then `VDomUpdate.executeCallbacks`.
3.  **Selective Clearing:** `executeCallbacks` now only removes the specific child IDs that were actually processed. Any new merge requests that arrived during the in-flight window are preserved.
4.  **Automatic Recovery:** The preserved merge requests trigger the `needsVdomUpdate` flag on the parent (or remain pending), ensuring they are picked up in the *next* update cycle.

**Additional Fixes:**
-   Fixed `VdomLifecycle.spec.mjs` test expectation: A component hidden with `removeDom` correctly has `mounted: false`.

**Verification:**
-   `RaceCondition.spec.mjs` passes all tests.
-   `VdomLifecycle.spec.mjs` passes all tests.
-   `RealWorldUpdates.spec.mjs` passes all tests.

## Timeline

- 2026-01-20T16:03:58Z @tobiu added the `bug` label
- 2026-01-20T16:03:58Z @tobiu added the `ai` label
- 2026-01-20T16:03:59Z @tobiu added the `testing` label
- 2026-01-20T16:03:59Z @tobiu added the `core` label
- 2026-01-20T16:05:20Z @tobiu referenced in commit `74e4742` - "fix: VDOM Merge Race Condition during In-Flight Updates (#8829)"
- 2026-01-20T16:05:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T16:05:38Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for the race condition where merged child updates were lost if the parent was already executing an update.
> 
> **Changes:**
> 1.  **`src/mixin/VdomLifecycle.mjs`**:
>     *   Updated `executeVdomUpdate` to capture the `mergedChildIds` used for the current update cycle.
>     *   Passed this snapshot to `resolveVdomUpdate`.
> 2.  **`src/manager/VDomUpdate.mjs`**:
>     *   Updated `executeCallbacks` to accept the `processedChildIds` snapshot.
>     *   It now selectively removes only the processed child IDs from the `mergedCallbackMap`, ensuring that any new merges that arrived *during* the update execution are preserved for the next cycle.
> 3.  **`test/playwright/unit/vdom/VdomLifecycle.spec.mjs`**:
>     *   Corrected the test expectation for `vnode should PERSIST when component is hidden (removeDom)`. `mounted` should be `false` when hidden via `removeDom`.
> 
> **Verification:**
> *   `test/playwright/unit/vdom/RaceCondition.spec.mjs`: All 4 tests passed.
> *   `test/playwright/unit/vdom/VdomLifecycle.spec.mjs`: All tests passed.
> *   `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`: All 8 tests passed.
> 
> This ensures robust VDOM update merging even under heavy parallel load.

- 2026-01-20T16:05:52Z @tobiu closed this issue

