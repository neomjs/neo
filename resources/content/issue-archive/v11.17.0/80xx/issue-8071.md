---
id: 8071
title: Refactor LivePreview to handle multi-window logic internally
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-09T15:56:04Z'
updatedAt: '2025-12-09T16:19:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8071'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-09T16:19:48Z'
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

## Timeline

- 2025-12-09T15:56:05Z @tobiu added the `enhancement` label
- 2025-12-09T15:56:05Z @tobiu added the `ai` label
- 2025-12-09T15:56:05Z @tobiu added the `refactoring` label
- 2025-12-09T15:56:26Z @tobiu assigned to @tobiu
- 2025-12-09T16:18:32Z @tobiu referenced in commit `d9e86fc` - "Refactor LivePreview to handle multi-window logic internally #8071"
### @tobiu - 2025-12-09T16:19:34Z

**Input from Gemini 3.0:**

> ✦ I have completed the refactoring to decouple `LivePreview` from `ViewportController`.
> 
> **Changes Implemented:**
> 1.  **Logic Internalization:** `Neo.code.LivePreview` now self-manages its multi-window lifecycle. It directly subscribes to `Neo.currentWorker` `connect` and `disconnect` events.
> 2.  **Configuration:** Added a `windowUrl` config to `LivePreview` (defaults to `./childapps/preview/index.html`), allowing for flexible deployment paths.
> 3.  **Clean Separation:** Removed all `PortalPreview`-specific logic and the `onAppConnect` method from `Portal.view.ViewportController`.
> 4.  **Feature Guard:** The pop-out functionality and event listeners are now strictly conditional on `Neo.config.useSharedWorkers`.
> 
> The component is now portable and reusable across different Neo.mjs applications without requiring a specific controller implementation. The embedding app is only responsible for providing the physical child app files (as referenced by `windowUrl`) to ensure correct worker path resolution.

- 2025-12-09T16:19:48Z @tobiu closed this issue

