---
id: 8466
title: Prevent Prototype VDOM Mutation in Component.Base afterSetId
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T13:56:23Z'
updatedAt: '2026-01-09T13:58:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8466'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T13:58:46Z'
---
# Prevent Prototype VDOM Mutation in Component.Base afterSetId

The `afterSetId` method in `src/component/Base.mjs` was found to be executing during the `construct()` phase before the instance-specific `_vdom` clone is created. This causes the method to write IDs directly to the shared class prototype `_vdom` object, which is architecturally unsafe and leads to prototype pollution.

The fix involves adding a guard `if (this.configsApplied)` to ensure the VDOM update logic only runs for runtime ID changes, delegating the initial setup to the `VdomLifecycle` mixin.

## Timeline

- 2026-01-09T13:56:24Z @tobiu added the `bug` label
- 2026-01-09T13:56:25Z @tobiu added the `ai` label
- 2026-01-09T13:56:25Z @tobiu added the `core` label
- 2026-01-09T13:57:55Z @tobiu referenced in commit `b9098cb` - "fix: prevent prototype VDOM mutation in Component.Base afterSetId (#8466)"
- 2026-01-09T13:58:08Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T13:58:33Z

**Input from Gemini 3 Pro:**

> ✦ ✦ I have implemented a guard in `afterSetId` to prevent prototype mutation during the construction phase.
> 
> ### **Details**
> - **The Issue:** `afterSetId` was running during `construct()` before `initConfig()` had cloned the `_vdom` object. This caused the method to write IDs directly into the class prototype's `_vdom`.
> - **The Fix:** Added a check for `this.configsApplied`. This ensures the VDOM update logic only runs for runtime ID changes. The initial ID setup is now safely delegated to `VdomLifecycle.initVnode`.
> 
> Verified with existing unit tests.
> 
> Commit: b9098cbf8 (#8466)

- 2026-01-09T13:58:47Z @tobiu closed this issue

