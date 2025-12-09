---
id: 8071
title: Refactor LivePreview to handle multi-window logic internally
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-12-09T15:56:04Z'
updatedAt: '2025-12-09T15:56:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8071'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor LivePreview to handle multi-window logic internally

This refactoring aims to decouple the `Neo.code.LivePreview` component from the `Portal.view.ViewportController`.

**Scope:**
1.  **Internalize Logic:** Move the `onAppConnect` and `onAppDisconnect` logic from `ViewportController.mjs` directly into `LivePreview.mjs`.
2.  **Worker Events:** `LivePreview` will subscribe directly to `Neo.currentWorker` events.
3.  **Configuration:** Add a `windowUrl` config to `LivePreview` (default: `'./childapps/preview/index.html'`) to allow apps to customize the location of the preview entry point.
4.  **Multi-Window Guard:** Ensure the `pop-out` button and event listeners are only active if `Neo.config.useSharedWorkers` is true.
5.  **Cleanup:** Remove the `PortalPreview` specific logic from `apps/portal/view/ViewportController.mjs`.

**Note on Child Apps:**
This refactor retains the requirement for the embedding application to provide the physical child app files (index.html, app.mjs) to ensure correct worker path resolution in production builds.

## Activity Log

- 2025-12-09 @tobiu added the `enhancement` label
- 2025-12-09 @tobiu added the `ai` label
- 2025-12-09 @tobiu added the `refactoring` label

