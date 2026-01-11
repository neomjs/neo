---
id: 8494
title: Investigate and Fix Service Worker Cache Update Flakiness
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T10:01:47Z'
updatedAt: '2026-01-10T10:46:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8494'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T10:46:22Z'
---
# Investigate and Fix Service Worker Cache Update Flakiness

The Service Worker update mechanism is inconsistent. While a version bump in `ServiceWorker.mjs` triggers a new SW installation, the takeover process is flaky. Users sometimes require multiple reloads or manual DevTools intervention to clear the old cache and load the new version.

**Risk:** A "blank page" scenario for first-time or returning users after a deployment.

**Goal:** Ensure a robust, zero-friction update strategy where the new Service Worker takes over immediately and reliably clears outdated cache assets.

**Investigation Areas:**
- `skipWaiting()` and `clients.claim()` implementation.
- Cache invalidation logic.
- Potential race conditions during the `activate` phase.

## Timeline

- 2026-01-10T10:01:49Z @tobiu added the `bug` label
- 2026-01-10T10:01:49Z @tobiu added the `ai` label
- 2026-01-10T10:01:49Z @tobiu added the `core` label
### @tobiu - 2026-01-10T10:12:01Z

**Input from Gemini 3 Pro:**

> ✦ **Correction on Risk Assessment:**
> The failure mode is not just users getting stuck on an old version; the critical risk is that the update process can fail midway, leaving the user with a **blank page**. This elevates the severity of this issue significantly.

- 2026-01-10T10:21:08Z @tobiu assigned to @tobiu
- 2026-01-10T10:45:52Z @tobiu referenced in commit `3448118` - "fix: Harden Service Worker lifecycle and prevent cache poisoning (#8494)"
### @tobiu - 2026-01-10T10:46:04Z

**Input from tobiu:**

> ◆ I have implemented a fix to harden the Service Worker lifecycle and prevent cache poisoning.
> 
> **Changes:**
> 1.  **Prevent Cache Poisoning:** Refactored `onFetch` in `src/worker/ServiceBase.mjs` to only cache responses with `response.ok` (status 200-299) or `response.status === 0` (opaque responses). This prevents 404s or 500s from polluting the cache during deployment windows.
> 2.  **Lifecycle Hardening:** Added `event.waitUntil()` to `onInstall` and `onActivate` handlers. This ensures the browser does not terminate the Service Worker before it has finished critical tasks like `skipWaiting()`, claiming clients, and cleaning up old caches.
> 3.  **Removed Aggressive Reload:** Removed the `updatefound` listener in `src/main/addon/ServiceWorker.mjs` that triggered an immediate page reload. This prevents jarring user experiences where the page would reload unexpectedly when a new version was detected.
> 4.  **Async Message Handling:** Updated `onMessage` to support `event.waitUntil()` for asynchronous message handlers, ensuring promises resolve correctly before the event is considered complete.
> 
> These changes should eliminate the "blank page" risk by ensuring only valid assets are cached and that the Service Worker transitions states reliably.

- 2026-01-10T10:46:22Z @tobiu closed this issue

