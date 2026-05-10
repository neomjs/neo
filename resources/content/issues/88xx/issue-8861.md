---
id: 8861
title: Fix Worker Paths for Production and Bump Version
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-01-22T00:08:41Z'
updatedAt: '2026-01-22T00:08:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8861'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix Worker Paths for Production and Bump Version

This task fixes critical path resolution issues for `dist/production` builds and bumps the version to invalidate stale Service Worker caches.

1.  **Fix Worker Paths:** In `dist/production`, worker files (`appworker.js`, etc.) are located at the project root (or `dist/production/`), not in `src/worker/`. `Manager.mjs` was incorrectly using `workerBasePath` (`src/worker/`) for these files.
    *   Update `src/worker/Manager.mjs` to use `Neo.config.basePath` for workers when `useMjsFiles` is false.
    *   Update `src/main/addon/ServiceWorker.mjs` to always use `Neo.config.basePath` for `serviceworker.js`, as it resides at the build root.

2.  **Bump Version:** Increment `Neo.config.version` in `src/DefaultConfig.mjs` and `package.json` to `11.23.1`. This changes the `cacheName` in `ServiceBase`, forcing the Service Worker to create a fresh cache and abandon the stale one causing runtime errors.

## Timeline

- 2026-01-22T00:08:43Z @tobiu added the `bug` label
- 2026-01-22T00:08:43Z @tobiu added the `ai` label
- 2026-01-22T00:08:43Z @tobiu added the `core` label

