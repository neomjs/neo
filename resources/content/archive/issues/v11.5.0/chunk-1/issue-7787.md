---
id: 7787
title: Implement Client-Side SSR Takeover Logic and VdomLifecycle Clarifications
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-17T23:14:04Z'
updatedAt: '2025-11-17T23:34:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7787'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-17T23:34:42Z'
---
# Implement Client-Side SSR Takeover Logic and VdomLifecycle Clarifications

This ticket covers the implementation of the client-side logic required for the framework to "take over" a server-rendered page, along with clarifications for VdomLifecycle configurations. This process does not involve re-hydrating or modifying the initial DOM.

**Changes:**

1.  **`tmp/service/SsrService.mjs`:**
    -   The `hash` object (containing the `hashString` and `windowId`) is now included in the `ssrData` payload sent to the client.

2.  **`src/worker/Manager.mjs`:**
    -   The `createWorkers()` method is updated to check for `ssrData.hash` and inject it into the initial configuration for all workers. This ensures the client-side router starts with the correct route information from the server.

3.  **`src/controller/Application.mjs`:**
    -   `beforeSetMainView()` is modified to set `autoInitVnode: false` and `autoMount: false` on the `mainView` in an SSR context, preventing an unnecessary initial render.
    -   `afterSetMainView()` is modified to perform the "takeover". In an SSR context, it assigns the server-provided `vnode` to the `mainView` and sets its `mounted` state to `true` after the router has processed the initial route.

4.  **`src/mixin/VdomLifecycle.mjs`:**
    -   The JSDoc comment for the `autoInitVnode` config is updated to clarify its intended use: `true` for components like dialogs and drag-proxies, and `false` for top-level views (especially in SSR scenarios).

These changes work together to enable a seamless and efficient takeover of the server-rendered application state by the client, and improve clarity for framework users.

## Timeline

- 2025-11-17T23:14:05Z @tobiu added the `enhancement` label
- 2025-11-17T23:14:06Z @tobiu added the `ai` label
- 2025-11-17T23:34:35Z @tobiu referenced in commit `55fe150` - "Implement Client-Side SSR Takeover Logic and VdomLifecycle Clarifications #7787"
- 2025-11-17T23:34:42Z @tobiu closed this issue

