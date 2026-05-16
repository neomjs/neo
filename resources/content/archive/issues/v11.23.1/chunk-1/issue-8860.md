---
id: 8860
title: Fix Service Worker clone error and Manager initialization race conditions
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-21T23:57:21Z'
updatedAt: '2026-01-22T00:08:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8860'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-22T00:08:47Z'
---
# Fix Service Worker clone error and Manager initialization race conditions

This task addresses three runtime errors discovered in `dist/production` builds:

1.  **Service Worker Error:** `TypeError: Failed to execute 'clone' on 'Response': Response body is already used`.
    *   **Cause:** The `response.clone()` method is called inside an asynchronous `caches.open().then()` block. By the time this block executes, the browser has likely already consumed the original response body (which was returned immediately to `respondWith`).
    *   **Fix:** Clone the response synchronous-immediately upon receipt, before any async cache operations.

2.  **Manager Initialization Error:** `TypeError: Cannot set properties of undefined (setting 'neo-5')` inside `promiseMessage`.
    *   **Cause:** `me.promises` is initialized at the end of the `construct` method, but `checkServiceWorkerVersion()` (which uses `promiseMessage`) is called earlier in the constructor.
    *   **Fix:** Move `me.promises = {}` initialization to the beginning of the `construct` method.

3.  **Manager getWorker Error:** `TypeError: Cannot read properties of undefined (reading 'worker')`.
    *   **Cause:** `getWorker(name)` attempts to access `this.workers[name].worker` without checking if `this.workers[name]` exists.
    *   **Fix:** Add a safety check for the existence of the worker entry in `this.workers`.

## Timeline

- 2026-01-21T23:57:22Z @tobiu added the `bug` label
- 2026-01-21T23:57:22Z @tobiu added the `ai` label
- 2026-01-21T23:57:22Z @tobiu added the `core` label
- 2026-01-22T00:02:49Z @tobiu referenced in commit `2776bdb` - "fix: ServiceWorker clone error and Manager init race conditions (#8860)"
- 2026-01-22T00:03:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-22T00:03:05Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the following fixes to address the runtime errors in `dist/production`:
> 
> 1.  **Service Worker Clone Error:** Updated `src/worker/ServiceBase.mjs` to synchronously clone the response in `onFetch` before any async cache operations. This prevents the "Response body is already used" error.
> 2.  **Manager Initialization Race Condition:** Updated `src/worker/Manager.mjs` to initialize `me.promises = {}` at the very beginning of the `construct` method. This ensures it's available when `checkServiceWorkerVersion` (and subsequently `promiseMessage`) is called.
> 3.  **Manager getWorker Safety Check:** Updated `getWorker` in `src/worker/Manager.mjs` to check for the existence of `this.workers[name]` before accessing its `.worker` property, preventing the "Cannot read properties of undefined" error.
> 
> The changes have been committed and pushed to `dev`.

- 2026-01-22T00:08:47Z @tobiu closed this issue

