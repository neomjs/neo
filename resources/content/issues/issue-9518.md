---
id: 9518
title: Fix LivePreview incorrect popout URL for subsequent windows (SharedWorkers)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-19T12:44:15Z'
updatedAt: '2026-03-19T14:38:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9518'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-19T14:25:33Z'
---
# Fix LivePreview incorrect popout URL for subsequent windows (SharedWorkers)

The root cause of the initial LivePreview popout bug was that the child app configuration (specifically the `appPath`) was incorrectly being merged into the global `Neo.config` via `worker.Base`'s `onRegisterNeoConfig` method during SharedWorker setups. 

The fix involved decoupling the boot sequence from the static global `Neo.config` while avoiding the constant state 'flapping' that caused the bug:

1. **`src/worker/Base.mjs`**: Hardened to strictly merge the initial window connection data into `Neo.config`. Child apps' configs are securely kept within `Neo.windowConfigs`.
2. **`src/worker/Manager.mjs`**: Now explicitly includes `windowId: this.windowId` in the `loadApplication` message payload sent to the App worker.
3. **`src/worker/App.mjs`**: `onLoadApplication` now uses the correct `appPath` derived from `Neo.windowConfigs[data.windowId]`. It sets a synchronous `Neo.bootingWindowId` flag specifically for the duration of the `module.onStart()` execution tick to pass context down the stack. It also conditionally fetches the `theme-map.json` only once using a new `themeMapFetchStarted` flag.
4. **`src/controller/Application.mjs`**: Updated both the `construct` and `beforeSetMainView` methods to use the instance's proper `this.windowId` (inherited via the boot flag) instead of statically falling back to `Neo.config.windowId`.
5. **`src/code/LivePreview.mjs`**: Updated `beforeSetWindowUrl` to dynamically access the active window's `appPath` directly from `Neo.windowConfigs[windowId]`, preventing URL segment duplication (`childapps/preview/`).
6. **`src/component/Circle.mjs`, `Gallery.mjs`, & `Helix.mjs`**: Updated to dynamically retrieve path variables from `Neo.windowConfigs` in `afterSetWindowId` to support distinct base paths across multiple active windows.

All changes have been successfully committed and pushed to the `dev` branch.

## Timeline

- 2026-03-19T12:44:16Z @tobiu added the `bug` label
- 2026-03-19T12:44:16Z @tobiu added the `ai` label
- 2026-03-19T14:24:24Z @tobiu referenced in commit `da2169f` - "fix: LivePreview incorrect popout URL and SharedWorker routing issues (#9518)"
### @tobiu - 2026-03-19T14:24:46Z

**Input from Gemini 3.1 Pro:**

> ✦ The issue has been fully resolved.
> 
> The root cause of the bug expanded beyond just `LivePreview` URL generation. The core issue was that child applications connecting via SharedWorkers were failing to correctly identify their unique `windowId`, falling back to the original Portal's `windowId` during the boot sequence. This caused the new child app's `mainView` to render into the Portal's DOM (effectively replacing the entire portal app viewport) instead of its own popup window.
> 
> The comprehensive fix implements explicit context passing for the boot sequence while decoupling it from the static global `Neo.config`:
> 
> 1.  **`src/worker/Manager.mjs`**: Now explicitly includes `windowId: this.windowId` in the `loadApplication` message payload sent to the App worker.
> 2.  **`src/worker/App.mjs`**: `onLoadApplication` now uses the correct `appPath` derived from `Neo.windowConfigs[data.windowId]`. Crucially, it sets a synchronous `Neo.bootingWindowId` flag specifically for the duration of the `module.onStart()` execution tick to pass context down the stack.
> 3.  **`src/controller/Application.mjs`**: Updated both the `construct` and `beforeSetMainView` methods to use the instance's proper `this.windowId` (inherited via the boot flag) instead of statically falling back to `Neo.config.windowId`.
> 4.  **`src/component/Circle.mjs`, `Gallery.mjs`, & `Helix.mjs`**: Updated to dynamically retrieve path variables from `Neo.windowConfigs` in `afterSetWindowId` to support distinct base paths across multiple active windows.
> 
> All changes have been committed and pushed to the `dev` branch.

- 2026-03-19T14:25:33Z @tobiu closed this issue
### @tobiu - 2026-03-19T14:30:09Z

The initial LivePreview routing bug and the subsequent multi-window routing regressions have been resolved. The fix involves explicitly passing the `windowId` during application boot to decouple the boot sequence from the flapping global `Neo.config`, allowing child applications to accurately resolve their respective configurations directly from `Neo.windowConfigs`.

- 2026-03-19T14:38:16Z @tobiu assigned to @tobiu

