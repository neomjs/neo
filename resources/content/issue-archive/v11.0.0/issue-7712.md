---
id: 7712
title: Investigate and Fix Race Condition Where Early Component Updates are Lost
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-06T14:14:58Z'
updatedAt: '2025-11-06T14:39:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7712'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-06T14:39:59Z'
---
# Investigate and Fix Race Condition Where Early Component Updates are Lost

The framework currently exhibits a race condition where component updates, if triggered immediately after creation, can be lost instead of being correctly queued. This has resulted in flaky Playwright tests that require manual synchronization (`expect()` calls) to work reliably.

A robust framework should handle these early updates gracefully by scheduling them to run after the initial render and mount process is complete. The fact that updates are being dropped indicates a flaw in the VDOM lifecycle management.

**Plan:**
1.  **Isolate the Bug:** Create a minimal, reproducible test case (e.g., a new example) that programmatically creates a component and immediately calls `set()` on it in the next microtask.
2.  **Add Diagnostic Logging:** Temporarily add detailed logging to key methods in `src/mixin/VdomLifecycle.mjs` (`initVnode`, `updateVdom`, `resolveVdomUpdate`) to trace the component's state (`isVdomUpdating`, `vnodeInitialized`, `needsVdomUpdate`) through the entire lifecycle.
3.  **Analyze and Fix:** Use the logs from the test case to identify the exact point where the update is being dropped and implement a fix to ensure it is correctly queued and processed.

## Timeline

- 2025-11-06T14:14:59Z @tobiu added the `bug` label
- 2025-11-06T14:14:59Z @tobiu added the `ai` label
- 2025-11-06T14:39:11Z @tobiu assigned to @tobiu
- 2025-11-06T14:39:33Z @tobiu referenced in commit `b0b484e` - "Investigate and Fix Race Condition Where Early Component Updates are Lost #7712"
- 2025-11-06T14:39:59Z @tobiu closed this issue

