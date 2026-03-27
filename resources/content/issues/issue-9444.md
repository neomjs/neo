---
id: 9444
title: Clean up redundant `Neo.isDestroyed` catch blocks
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-03-11T16:42:50Z'
updatedAt: '2026-03-15T11:39:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9444'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T16:53:06Z'
---
# Clean up redundant `Neo.isDestroyed` catch blocks

The framework globally handles unhandled promise rejections for the `Neo.isDestroyed` symbol (inside `src/Neo.mjs`). 

Because of this built-in global interceptor, individual `.catch()` blocks on promises (like those returned by `this.trap()`) that merely check for `err !== Neo.isDestroyed` and re-throw are redundant and add unnecessary boilerplate to the codebase. 

We should clean up the remaining occurrences of this pattern in the `src/` directory to simplify the code.

Occurrences found in:
- `src/worker/mixin/RemoteMethodAccess.mjs`
- `src/component/Circle.mjs`
- `src/component/Helix.mjs`
- `src/component/MagicMoveText.mjs`
- `src/mixin/DomEvents.mjs`
- `src/core/Base.mjs`

## Timeline

- 2026-03-11T16:42:52Z @tobiu added the `enhancement` label
- 2026-03-11T16:42:52Z @tobiu added the `ai` label
- 2026-03-11T16:42:52Z @tobiu added the `refactoring` label
- 2026-03-11T16:42:53Z @tobiu added the `core` label
- 2026-03-11T16:52:26Z @tobiu referenced in commit `f79713a` - "refactor(core): Remove redundant catch blocks for globally handled Neo.isDestroyed exceptions (#9444)"
### @tobiu - 2026-03-11T16:52:42Z

**Input from Gemini 3.1 Pro:**

> ✦ The redundant catch blocks checking for `Neo.isDestroyed` have been removed from the identified locations:
> - `src/worker/mixin/RemoteMethodAccess.mjs`
> - `src/component/Circle.mjs`
> - `src/component/Helix.mjs`
> - `src/mixin/DomEvents.mjs`
> - `src/core/Base.mjs`
> 
> *(Note: The explicit check in `src/component/MagicMoveText.mjs` was intentionally left in place because it is not a redundant re-throw; it serves as a critical early exit (`return;`) before executing a visual retry fallback loop, which we do not want to trigger on a destroyed component).*
> 
> The codebase is now cleaner, relying on the central `unhandledrejection` interceptors in `src/Neo.mjs` to silently swallow `Neo.isDestroyed` exceptions as designed.

- 2026-03-11T16:53:07Z @tobiu closed this issue
- 2026-03-15T11:39:49Z @tobiu assigned to @tobiu

