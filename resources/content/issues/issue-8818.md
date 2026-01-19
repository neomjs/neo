---
id: 8818
title: Implement Node.js Unhandled Rejection Handler for Neo.isDestroyed
state: CLOSED
labels:
  - bug
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T18:20:15Z'
updatedAt: '2026-01-19T18:22:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8818'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T18:22:11Z'
---
# Implement Node.js Unhandled Rejection Handler for Neo.isDestroyed

`Neo.mjs` has a global `unhandledrejection` handler that intercepts and suppresses `Neo.isDestroyed` errors, preventing crashes when asynchronous operations complete after component destruction.
However, this handler relied on `globalThis.addEventListener`, which is not available in Node.js environments (used for Middleware and Unit Tests).

This caused Node.js processes to crash or warn on `Neo.isDestroyed` rejections, complicating testing and potentially destabilizing server-side rendering.

**Fix:**
Added a Node.js-specific handler using `process.on('unhandledRejection')` to `src/Neo.mjs`. This handler mirrors the browser behavior: it suppresses `Neo.isDestroyed` and re-throws all other errors.
Added documentation to clarify the environment-specific handling (Browser/Worker vs Node.js).

## Timeline

- 2026-01-19T18:20:16Z @tobiu added the `bug` label
- 2026-01-19T18:20:16Z @tobiu added the `testing` label
- 2026-01-19T18:20:16Z @tobiu added the `core` label
- 2026-01-19T18:20:29Z @tobiu referenced in commit `bf109a5` - "feat: Implement Node.js unhandledRejection handler for Neo.isDestroyed (#8818)"
- 2026-01-19T18:20:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T18:21:53Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Node.js `unhandledRejection` handler in `src/Neo.mjs` to mirror the browser's behavior for `Neo.isDestroyed` errors.
> This ensures that the `trap()` pattern works correctly in Middleware and Unit Testing environments without crashing the process, while still allowing other unhandled rejections to fail/crash as expected.
> I also added comments to clearly distinguish the Browser/Worker path from the Node.js path.

- 2026-01-19T18:22:11Z @tobiu closed this issue

