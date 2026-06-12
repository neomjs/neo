---
id: 8759
title: 'ServiceWorker: Enforce Network-First Strategy for Config Files'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-17T17:01:49Z'
updatedAt: '2026-01-17T17:06:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8759'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T17:06:44Z'
---
# ServiceWorker: Enforce Network-First Strategy for Config Files

## Description
The Service Worker update strategy currently relies on version checks in the app layer (DefaultConfig, neo-config.json). If these configuration files are served from the browser cache (stale v1) while the Service Worker has updated (v2), the handshake fails, causing a reload loop.

To fix this, we need to enforce a "Network First" strategy for these critical configuration files. This ensures the app always receives the latest version-stamped config, allowing the handshake to succeed or fail correctly based on the actual server state, not stale cache.

## Tasks
1.  Modify `src/worker/ServiceBase.mjs`:
    -   Add `networkFirstPaths` config/property containing `['neo-config.json', 'DefaultConfig.mjs']`.
    -   Update `onFetch` to check this list *before* the standard `cachePaths` logic.
    -   Implement the "Network First" strategy:
        -   Try `fetch(request)` first.
        -   If successful: Update cache, return response.
        -   If failed (offline): Return `cache.match(request)`.

## Acceptance Criteria
-   `neo-config.json` and `DefaultConfig.mjs` requests always attempt a network fetch first.
-   Offline support is preserved (fallback to cache works).
-   Reload loops caused by stale cached configs are eliminated.

## Timeline

- 2026-01-17T17:01:50Z @tobiu added the `bug` label
- 2026-01-17T17:01:50Z @tobiu added the `ai` label
- 2026-01-17T17:01:50Z @tobiu added the `core` label
- 2026-01-17T17:06:05Z @tobiu referenced in commit `15a9a1e` - "fix: Enforce Network-First strategy for config files to prevent SW update loops (#8759)"
### @tobiu - 2026-01-17T17:06:18Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Network-First strategy for `DefaultConfig.mjs` and `neo-config.json` in `src/worker/ServiceBase.mjs`.
> 
> **Changes:**
> 1.  **Added `networkFirstPaths`:** Defined a list of critical config files.
> 2.  **Updated `onFetch`:** Implemented a priority check for these paths.
>     -   It attempts to fetch with `{cache: 'reload'}` to bypass the browser cache.
>     -   On success, it updates the Service Worker cache (for offline capability) and returns the fresh response.
>     -   On failure (offline), it falls back to the cache.
> 3.  **Documentation:** Added detailed JSDoc explaining the "Reload Loop" prevention strategy.
> 
> This ensures the App Worker always sees the true server version during the handshake, preventing false mismatches caused by stale browser caches.

- 2026-01-17T17:06:25Z @tobiu assigned to @tobiu
- 2026-01-17T17:06:44Z @tobiu closed this issue

