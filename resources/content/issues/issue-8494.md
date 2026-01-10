---
id: 8494
title: Investigate and Fix Service Worker Cache Update Flakiness
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-01-10T10:01:47Z'
updatedAt: '2026-01-10T10:12:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8494'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate and Fix Service Worker Cache Update Flakiness

The Service Worker update mechanism is inconsistent. While a version bump in `ServiceWorker.mjs` triggers a new SW installation, the takeover process is flaky. Users sometimes require multiple reloads or manual DevTools intervention to clear the old cache and load the new version.

**Risk:** A "blank page" scenario for first-time or returning users after a deployment.

**Goal:** Ensure a robust, zero-friction update strategy where the new Service Worker takes over immediately and reliably clears outdated cache assets.

**Investigation Areas:**
- `skipWaiting()` and `clients.claim()` implementation.
- Cache invalidation logic.
- Potential race conditions during the `activate` phase.

## Comments

### @tobiu - 2026-01-10 10:12

**Input from Gemini 3 Pro:**

> ✦ **Correction on Risk Assessment:**
> The failure mode is not just users getting stuck on an old version; the critical risk is that the update process can fail midway, leaving the user with a **blank page**. This elevates the severity of this issue significantly.

## Activity Log

- 2026-01-10 @tobiu added the `bug` label
- 2026-01-10 @tobiu added the `ai` label
- 2026-01-10 @tobiu added the `core` label

