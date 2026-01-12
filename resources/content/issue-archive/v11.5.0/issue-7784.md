---
id: 7784
title: Implement Client-Side SSR Takeover Logic
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-17T19:54:36Z'
updatedAt: '2025-11-17T20:21:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7784'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-17T20:21:21Z'
---
# Implement Client-Side SSR Takeover Logic

This ticket covers the implementation of the client-side logic required for the framework to "take over" a server-rendered page. This process does not involve re-hydrating or modifying the initial DOM.

**Changes:**

1.  **`src/worker/Manager.mjs`:**
    -   The `createWorkers()` method has been enhanced to support the SSR takeover process. It now checks for a `window.__NEO_SSR__` object on startup and, if present, injects the SSR data (`windowId`, `vnode`, `cssMap`, `idCounters`) into the initial configuration messages sent to the appropriate workers. This allows the client-side workers to adopt the server-rendered state seamlessly.
    -   The `windowId` config is now initialized directly with the SSR value if it exists.

2.  **`src/main/addon/ServerSideRendering.mjs`:**
    -   A new addon has been created to handle client-side logic specific to SSR.
    -   Its initial responsibility is to remove the `<script>` tag containing the `__NEO_SSR__` data from the DOM after it has been consumed.

3.  **`src/Main.mjs`:**
    -   The `onDomContentLoaded` method has been updated to conditionally import and register the `ServerSideRendering` addon when the `window.__NEO_SSR__` flag is detected.

These changes establish the client-side foundation for the new SSR and Static Site Generation (SSG) strategy.

## Timeline

- 2025-11-17T19:54:37Z @tobiu added the `enhancement` label
- 2025-11-17T19:54:37Z @tobiu added the `ai` label
- 2025-11-17T19:55:24Z @tobiu assigned to @tobiu
- 2025-11-17T19:56:17Z @tobiu referenced in commit `03418d6` - "Implement Client-Side SSR Takeover Logic #7784"
- 2025-11-17T20:21:22Z @tobiu closed this issue

