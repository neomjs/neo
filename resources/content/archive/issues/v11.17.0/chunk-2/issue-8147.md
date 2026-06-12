---
id: 8147
title: 'Enhancement: Async Remote Method Registration and Robust Worker Checking'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-19T21:07:00Z'
updatedAt: '2025-12-19T21:27:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8147'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T21:27:41Z'
---
# Enhancement: Async Remote Method Registration and Robust Worker Checking

This PR introduces a robust, asynchronous mechanism for registering remote methods across workers, replacing the previous "fire-and-forget" approach with a deterministic promise-based flow. It also includes critical fixes for main thread synchronization and addon registration.

**Key Changes:**

1.  **Async Remote Registration (`core.Base`):**
    *   Renamed `sendRemotes` to `promiseRemotes`.
    *   `promiseRemotes` now returns a `Promise` that resolves only when the target worker acknowledges the registration.
    *   `initRemote` and `initAsync` are now fully async and await this process.
    *   Added `remotesReady()` method and `#remotesReadyPromise` to allow external callers (like `Neo.Main`) to await full initialization.

2.  **Robust Worker Checking (`hasWorker`):**
    *   Implemented `hasWorker(name)` in `Neo.worker.Base` and `Neo.worker.Manager`.
    *   This method checks `Neo.config` (e.g., `useCanvasWorker`, `useServiceWorker`) or the active worker list to determine if a target worker actually exists.
    *   `promiseRemotes` now uses `origin.hasWorker()` to prevent sending messages to non-existent optional workers (like `task` or `canvas`), fixing runtime errors when these are disabled.

3.  **Main Thread Synchronization (`Neo.Main` & `Neo.worker.Manager`):**
    *   **`Neo.Main`:** `onDomContentLoaded` now explicitly awaits `remotesReady()` for all registered addons and the main instance itself. Removed the arbitrary `timeout(20)` race-condition workaround.
    *   **`Neo.worker.Manager`:** Updated `onWorkerConstructed` to check for `activeWorkers + 1`. The `+ 1` accounts for the main thread itself, ensuring `loadApplication` is only triggered when *all* threads (workers + main) are ready.

4.  **Addon Registration Fix (`Neo.Main`):**
    *   Fixed a race condition in `registerAddon`. If called multiple times (e.g., via remote method access) before completion, it could incorrectly overwrite the singleton instance in the namespace with the class constructor. The fix ensures `Neo.applyToGlobalNs(addon)` is only called when a new instance is actually created.

5.  **Service Worker Support:**
    *   Added `service` worker support to `hasWorker` checks, honoring `Neo.config.useServiceWorker`.

**Goal:**
Eliminate race conditions during application startup and ensure that all remote methods are guaranteed to be registered before the application logic proceeds.

## Timeline

- 2025-12-19T21:07:02Z @tobiu added the `enhancement` label
- 2025-12-19T21:07:02Z @tobiu added the `ai` label
- 2025-12-19T21:07:02Z @tobiu added the `core` label
- 2025-12-19T21:07:17Z @tobiu assigned to @tobiu
- 2025-12-19T21:20:12Z @tobiu referenced in commit `252196e` - "Enhancement: Async Remote Method Registration and Robust Worker Checking #8147"
- 2025-12-19T21:27:42Z @tobiu closed this issue
- 2026-01-05T19:30:55Z @tobiu cross-referenced by #8338

