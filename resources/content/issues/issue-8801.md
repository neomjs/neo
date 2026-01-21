---
id: 8801
title: Implement generic async destruction handling via Promise Rejection
state: CLOSED
labels:
  - ai
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T09:29:59Z'
updatedAt: '2026-01-19T10:17:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8801'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T10:17:13Z'
---
# Implement generic async destruction handling via Promise Rejection

Currently, `core.Base.timeout` promises hang forever if the component is destroyed before completion, causing memory leaks (async closures never GC'd). Manual `isDestroyed` checks after awaits are brittle.

Plan:
1.  Add `Neo.DESTROYED` constant.
2.  Add global `unhandledrejection` handler to suppress `Neo.DESTROYED` errors.
3.  Update `core.Base`:
    - Track `timeout` reject functions.
    - In `destroy()`, reject all pending timeouts with `Neo.DESTROYED`.
4.  Remove manual guards from `MagicMoveText` as a verification step.

## Timeline

- 2026-01-19T09:30:00Z @tobiu added the `ai` label
- 2026-01-19T09:30:00Z @tobiu added the `architecture` label
- 2026-01-19T09:30:00Z @tobiu added the `performance` label
- 2026-01-19T09:30:00Z @tobiu added the `core` label
- 2026-01-19T09:30:16Z @tobiu assigned to @tobiu
- 2026-01-19T10:16:38Z @tobiu referenced in commit `07b6933` - "feat: Implement generic async destruction handling via Promise Rejection (#8801)"
- 2026-01-19T10:17:13Z @tobiu closed this issue
### @tobiu - 2026-01-19T10:17:36Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the generic async destruction handling and verified it with unit tests and by updating `MagicMoveText`.
> 
> **Changes:**
> 1.  **`src/Neo.mjs`**: Added `Neo.isDestroyed` symbol and a global `unhandledrejection` handler to suppress errors rejected with this symbol.
> 2.  **`src/core/Base.mjs`**:
>     -   Refactored `#timeoutIds` array to `#timeouts` Map (id -> reject).
>     -   Updated `destroy()` to reject all pending timeouts with `Neo.isDestroyed`.
>     -   Updated `timeout()` to register and deregister reject functions.
> 3.  **`src/component/MagicMoveText.mjs`**:
>     -   Removed manual `if (me.isDestroyed) return;` checks after `await me.timeout(...)`.
>     -   Updated the `catch` block to explicitly ignore `Neo.isDestroyed` rejections to prevent unwanted retries.
> 4.  **`test/playwright/unit/core/BaseTimeout.spec.mjs`**: Added a comprehensive test suite to verify:
>     -   Timeout resolution.
>     -   Rejection on destruction.
>     -   Concurrent timeout handling.
>     -   Cleanup of completed timeouts.
> 
> **Verification:**
> The new test suite passed successfully, confirming that `timeout()` promises are now correctly rejected when an instance is destroyed, preventing memory leaks and zombie processes. The integration with `MagicMoveText` demonstrates the cleaner, guard-free usage pattern (for timeouts).
> 
> **Next Steps:**
> Other async methods like `promiseUpdate` and `getDomRect` currently do not auto-reject on destruction. This should be addressed in follow-up tasks to achieve full coverage.


