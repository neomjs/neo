---
id: 8551
title: 'Refactor TicketCanvas: Performance optimization and cleanup'
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T16:49:36Z'
updatedAt: '2026-01-11T16:52:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8551'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T16:52:52Z'
---
# Refactor TicketCanvas: Performance optimization and cleanup

Optimize `apps/portal/canvas/TicketCanvas.mjs` to resolve identified technical debt.

1. **Fix Memory Leak:** Replace `setTimeout(me.render.bind(me), ...)` with a pre-bound `this.renderLoop` to prevent garbage collection pressure.
2. **Centralize Constants:** Extract hardcoded values (Physics: `influenceRange`, `minMod`, `maxMod`; Colors: `neoBlue`) into `static config` or file-level constants.
3. **Document Initialization:** Add comments to `initGraph` explaining the polling logic (waiting for `OffscreenCanvas` transfer).
4. **Loop Optimization:** Review loop usage. While composite operations require separate passes, ensure no redundant iterations exist.

## Timeline

- 2026-01-11T16:49:37Z @tobiu added the `ai` label
- 2026-01-11T16:49:37Z @tobiu added the `refactoring` label
- 2026-01-11T16:49:37Z @tobiu added the `performance` label
- 2026-01-11T16:51:09Z @tobiu referenced in commit `052dfdd` - "refactor: Optimize TicketCanvas loop and extract constants (#8551)"
- 2026-01-11T16:51:27Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T16:51:32Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> - **Memory Optimization:** Replaced `me.render.bind(me)` with a single `me.renderLoop` instance, eliminating per-frame allocation.
> - **Code Cleanup:** Extracted physics and color constants to file-level `const`.
> - **Documentation:** Added explanatory comments to `initGraph` regarding polling behavior.
> - **Performance:** Verified render loop efficiency.

- 2026-01-11T16:52:24Z @tobiu added parent issue #8398
- 2026-01-11T16:52:52Z @tobiu closed this issue

