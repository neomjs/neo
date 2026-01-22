---
id: 8859
title: Enforce ESM Worker Instantiation Globally
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-21T23:48:36Z'
updatedAt: '2026-01-21T23:54:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8859'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T23:54:51Z'
---
# Enforce ESM Worker Instantiation Globally

The `hasJsModules` check in `src/worker/Manager.mjs` and `src/main/addon/ServiceWorker.mjs` incorrectly assumes that `dist/development` and `dist/production` do not support ES modules. This causes blank pages as the new webpack builds output ESM bundles.

Changes:
1.  Update `src/worker/Manager.mjs` to always instantiate workers with `{type: 'module'}`.
2.  Refactor `hasJsModules` logic to primarily control file extensions (`.mjs` vs `.js`) and pathing, rather than module capability.
3.  Update `src/main/addon/ServiceWorker.mjs` similarly.
4.  Review `src/remotes/Api.mjs` to ensure path resolution logic remains correct under the new environment assumptions.

## Timeline

- 2026-01-21T23:48:37Z @tobiu added the `bug` label
- 2026-01-21T23:48:37Z @tobiu added the `ai` label
- 2026-01-21T23:48:37Z @tobiu added the `core` label
- 2026-01-21T23:54:02Z @tobiu referenced in commit `72bdde6` - "fix: Enforce ESM worker instantiation for all environments (#8859)"
- 2026-01-21T23:54:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-21T23:54:33Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `src/worker/Manager.mjs`, `src/main/addon/ServiceWorker.mjs`, and `src/remotes/Api.mjs` to enforce ESM worker instantiation across all environments.
> 
> **Changes:**
> 1.  Renamed `hasJsModules` to `useMjsFiles` to correctly reflect its purpose (file extension/path selection vs. module capability).
> 2.  Updated `src/worker/Manager.mjs` to always use `{type: 'module'}` when creating workers.
> 3.  Updated `src/main/addon/ServiceWorker.mjs` to always use `{type: 'module'}` when registering the service worker.
> 4.  Updated `src/remotes/Api.mjs` to use the renamed variable for consistency in path resolution.
> 
> This ensures that `dist/development` and `dist/production` builds, which are now ESM, are loaded correctly.

- 2026-01-21T23:54:51Z @tobiu closed this issue

