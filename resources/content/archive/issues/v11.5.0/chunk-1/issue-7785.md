---
id: 7785
title: Implement VDom Worker SSR Takeover Logic
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-17T20:21:12Z'
updatedAt: '2025-11-17T20:26:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7785'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-17T20:26:06Z'
---
# Implement VDom Worker SSR Takeover Logic

This ticket documents the changes made to enable the VDom worker to correctly handle Server-Side Rendering (SSR) takeover.

**Changes:**

1.  **`src/worker/VDom.mjs`:**
    -   A new `onRegisterNeoConfig()` method has been added.
    -   This method checks for `config.useSSR` and `config.idCounters` in the initial configuration received from the `WorkerManager`.
    -   If both are present, it uses `Object.assign` to merge the `idCounters` into `Neo.core.IdGenerator.idCounter`. This ensures that the client-side VDom worker continues ID generation from where the server left off, preventing ID collisions during SSR takeover.

2.  **`src/worker/Manager.mjs`:**
    -   The `createWorkers()` method has been updated to consistently use `useSSR` (instead of `useSsr`) when injecting SSR-related configuration into the workers. This aligns with the framework's naming conventions.

These changes are crucial for the seamless integration of server-rendered content with the client-side VDom worker, supporting the overall SSR takeover strategy.

## Timeline

- 2025-11-17T20:21:12Z @tobiu added the `enhancement` label
- 2025-11-17T20:21:13Z @tobiu added the `ai` label
- 2025-11-17T20:21:30Z @tobiu assigned to @tobiu
- 2025-11-17T20:21:50Z @tobiu referenced in commit `4749d34` - "Implement VDom Worker SSR Takeover Logic #7785"
- 2025-11-17T20:26:06Z @tobiu closed this issue

