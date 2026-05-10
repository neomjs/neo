---
id: 8907
title: 'Regression: LoadMask no longer showing in Big Data Grid example'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-30T09:07:49Z'
updatedAt: '2026-01-30T09:08:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8907'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T09:08:51Z'
---
# Regression: LoadMask no longer showing in Big Data Grid example

### Description
The "Is Loading" mask in the Big Data Grid example (`examples/grid/bigData`) stopped appearing during heavy operations (e.g., changing "Amount Rows" or "Amount Columns").

### Root Cause
Recent changes in `src/mixin/VdomLifecycle.mjs` introduced an `await new Promise(resolve => setTimeout(resolve, 1));` inside `executeVdomUpdate`. This forces the VDOM update process to yield to the macrotask queue.

In `examples/grid/bigData/ControlsContainer.mjs`, the code sets `isLoading = 'Is Loading'` and immediately triggers a heavy synchronous operation (e.g., `grid.store.amountRows = ...`).

Because the App Worker is single-threaded, the synchronous data generation operation blocks the event loop. The `setTimeout` callback in `executeVdomUpdate` is starved until the heavy operation completes, causing the "Loading" mask update to be sent too late (after the work is already done).

### Fix
Manually yield execution in `ControlsContainer.mjs` after setting the loading state but *before* triggering the heavy operation. This allows the VDOM update macrotask to run and flush the mask state to the DOM.

### Impact
- `examples/grid/bigData/ControlsContainer.mjs`

### Proposed Changes
Add `await me.timeout(5);` in:
- `onAmountColumnsChange`
- `onAmountRowsChange`
- `onFilterFieldChange`
- `onControlsToggleButtonClick` (already present, ensuring consistency)

**Verification:**
User has verified the fix locally.

## Timeline

- 2026-01-30T09:07:50Z @tobiu added the `bug` label
- 2026-01-30T09:07:51Z @tobiu added the `ai` label
- 2026-01-30T09:07:51Z @tobiu added the `regression` label
- 2026-01-30T09:08:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T09:08:18Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to `examples/grid/bigData/ControlsContainer.mjs` by introducing a `me.timeout(5)` yield. This ensures the VDOM update has time to dispatch the 'Loading' state before the App Worker is blocked by the heavy data generation process.
> 
> Changes committed in `0fe6cd300`.

- 2026-01-30T09:08:22Z @tobiu referenced in commit `0fe6cd3` - "fix: LoadMask no longer showing in Big Data Grid example (#8907)"
- 2026-01-30T09:08:52Z @tobiu closed this issue

