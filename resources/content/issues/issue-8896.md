---
id: 8896
title: Refactor Node.js Unhandled Rejection Handling to process.emit Interception
state: CLOSED
labels:
  - testing
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-27T15:13:34Z'
updatedAt: '2026-01-27T15:15:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8896'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-27T15:15:22Z'
---
# Refactor Node.js Unhandled Rejection Handling to process.emit Interception

### Context
Neo.mjs components use a "Trap Pattern" (`promiseUpdate`, `trap`, `timeout`) to reject pending promises with `Neo.isDestroyed` when a component is destroyed. This prevents execution from continuing on dead objects. However, in Node.js environments (like Playwright unit tests or Server-Side Generation), these rejections often bubble up as "Unhandled Rejections," causing test runners to fail or processes to crash.

### Problem
The existing mechanism in `src/Neo.mjs` used `process.on('unhandledRejection')` to suppress these specific errors. However, this approach is fragile because test runners (like Playwright) attach their own listeners that may execute *before* the suppression logic or simply count the event emission itself as a failure.

### Solution
Refactor `src/Neo.mjs` to intercept the `unhandledRejection` event at the source by patching `process.emit`.

### Implementation
1.  **Intercept `process.emit`:** Wrap the native emit function.
2.  **Check Condition:** If the event is `'unhandledRejection'` AND the reason is `Neo.isDestroyed`, return `true` immediately. This swallows the event, preventing it from reaching *any* listeners.
3.  **Fallback:** For all other events, delegate to the original `process.emit`.

### Intent
This change transforms `Neo.isDestroyed` from an "error to be caught" into a "control flow signal to be ignored" at the infrastructure level. It ensures robustness across all Node.js-based environments (Tests, Scripts, SSG) without requiring repetitive `try/catch` blocks in application or test code.

## Timeline

- 2026-01-27T15:13:35Z @tobiu added the `testing` label
- 2026-01-27T15:13:35Z @tobiu added the `architecture` label
- 2026-01-27T15:13:35Z @tobiu added the `core` label
- 2026-01-27T15:14:58Z @tobiu referenced in commit `72c658b` - "core: Refactor Node.js Unhandled Rejection Handling to process.emit Interception (#8896)"
### @tobiu - 2026-01-27T15:15:02Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored the unhandled rejection handling in `src/Neo.mjs` to intercept `process.emit` directly. This robustly suppresses `Neo.isDestroyed` rejections across all Node.js environments, including test runners like Playwright that might otherwise preempt or ignore standard `process.on` listeners.
> 
> I verified this fix by running the full unit test suite, confirming that all tests pass without unhandled rejection failures.
> 
> I also cleaned up `test/playwright/setup.mjs` to remove the temporary local patch, ensuring the core framework handles this concern globally.

- 2026-01-27T15:15:06Z @tobiu assigned to @tobiu
- 2026-01-27T15:15:22Z @tobiu closed this issue

