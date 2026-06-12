---
id: 8690
title: Optimize ServiceWorker Update Transition
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-15T13:08:05Z'
updatedAt: '2026-01-15T13:19:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8690'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T13:19:51Z'
---
# Optimize ServiceWorker Update Transition

Users report blank pages during Neo.mjs version updates.
The investigation reveals that the current implementation of `onActivate` performs synchronous, blocking cache deletion inside `event.waitUntil()`. This prevents the browser from handling `fetch` events until all old caches are deleted, leading to perceived hang times or blank pages.

Changes:
1.  Refactor `onActivate` to perform `clients.claim()` immediately and resolve `waitUntil`.
2.  Move cache cleanup logic to a dedicated `cleanUpCaches` method.
3.  Trigger `cleanUpCaches` asynchronously (fire-and-forget) after activation, ensuring the UI thread is not blocked during the update.


## Timeline

- 2026-01-15T13:08:06Z @tobiu added the `enhancement` label
- 2026-01-15T13:08:06Z @tobiu added the `ai` label
- 2026-01-15T13:08:06Z @tobiu added the `performance` label
- 2026-01-15T13:08:06Z @tobiu added the `core` label
- 2026-01-15T13:18:52Z @tobiu referenced in commit `398b508` - "enhancement: Optimize ServiceWorker update transition (#8690)"
### @tobiu - 2026-01-15T13:19:04Z

**Input from Gemini 3 Pro:**

> ✦ I have optimized the ServiceWorker update transition to prevent blocking page loads.
> 
> **Changes Implemented:**
> 1.  **Lazy Cache Cleanup:** The `onActivate` handler now triggers `cleanUpCaches()` asynchronously without awaiting it inside `event.waitUntil()`. This ensures the Service Worker activates and claims clients immediately.
> 2.  **Dedicated Cleanup Method:** Added `cleanUpCaches()` to `ServiceBase.mjs` to handle the iteration and deletion of old versioned caches.
> 3.  **Verification of Versioning:** Confirmed that `ServiceBase` relies on `this.cacheName` (which appends `this.version`) to isolate caches per version (e.g., `neo-runtime-11.21.0`).
> 
> **Impact:**
> - **Faster Updates:** The new Service Worker will take control of the page almost instantly after installation.
> - **No Blocking:** The deletion of old caches (which can be slow) happens in the background, allowing network requests for the new version to proceed immediately.
> - **Blank Page Fix:** This should resolve the reported issue where users saw a blank page while the SW was busy deleting old files.
> 
> The changes have been pushed to `dev`.
> 

- 2026-01-15T13:19:25Z @tobiu assigned to @tobiu
- 2026-01-15T13:19:51Z @tobiu closed this issue

