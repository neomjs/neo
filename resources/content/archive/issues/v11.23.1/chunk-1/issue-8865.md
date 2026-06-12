---
id: 8865
title: Fix Manager runtime errors in dist/prod (promises init & getWorker check)
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-22T11:16:00Z'
updatedAt: '2026-01-22T11:37:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8865'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-22T11:37:12Z'
---
# Fix Manager runtime errors in dist/prod (promises init & getWorker check)

The `dist/production` build of Portal App throws two errors on the Main Thread:

1.  `Cannot set properties of undefined (setting 'neo-5')` in `promiseMessage`.
    *   **Cause:** `me.promises` appears to be undefined when `checkServiceWorkerVersion` is called during `construct`. Even though it is assigned in `construct`, the Native ESM build output may be affecting execution order or scope in unexpected ways.
    *   **Fix:** Convert `promises` to a class field. This guarantees it is initialized immediately upon instantiation, well before `construct()` is called.

2.  `Cannot read properties of undefined (reading 'worker')` in `getWorker`.
    *   **Cause:** `getWorker` attempts to access `this.workers[name].worker` without verifying if `this.workers[name]` exists.
    *   **Fix:** Add a safety check: `if (this.workers[name]) ...`.

**Tasks:**
1.  Update `src/worker/Manager.mjs`:
    -   Define `promises = {}` as a class field.
    -   Remove `me.promises = {}` from `construct`.
    -   Update `getWorker` to safely check for `this.workers[name]`.
2.  Verify the changes.

## Timeline

- 2026-01-22T11:16:02Z @tobiu added the `bug` label
- 2026-01-22T11:16:02Z @tobiu added the `ai` label
- 2026-01-22T11:16:02Z @tobiu added the `core` label
- 2026-01-22T11:36:27Z @tobiu referenced in commit `b347f39` - "fix: Manager initialization order for Native ESM builds (#8865)"
### @tobiu - 2026-01-22T11:36:39Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix for the runtime errors in `dist/production`.
> 
> **Changes:**
> 1.  **Manager Initialization:** Moved `me.promises = {}` to the very top of `construct()` in `src/worker/Manager.mjs`. This guarantees it is initialized before any other logic runs, resolving the `Cannot set properties of undefined` error.
> 2.  **GetWorker Safety:** Added a safety check in `getWorker()` to prevent `Cannot read properties of undefined` when accessing worker instances.
> 
> **Verification:**
> The user verified the fix by enabling logs in `dist/development` (which mirrors the production environment logic) and confirming that the errors are resolved and `promiseMessage` calls are successful.
> 
> The changes have been committed and pushed to `dev`.

- 2026-01-22T11:36:52Z @tobiu assigned to @tobiu
- 2026-01-22T11:37:13Z @tobiu closed this issue

