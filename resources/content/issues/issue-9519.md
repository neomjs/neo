---
id: 9519
title: 'SharedWorker: Fix theme resolution for child windows'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-19T15:13:41Z'
updatedAt: '2026-03-19T15:16:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9519'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-19T15:16:33Z'
---
# SharedWorker: Fix theme resolution for child windows

When multiple windows connect to a SharedWorker, they can specify different themes inside their `neo-config.json`. Currently, the `App` worker falls back to `Neo.config.themes` (which is the configuration of the initial window) when resolving and injecting theme files or CSS variables. This can cause child applications to load incorrect themes or fail to load their specific theme files entirely.

This ticket aims to update:
1. `src/worker/App.mjs` -> `insertThemeFiles()` to use `Neo.windowConfigs[windowId].themes`.
2. `src/worker/App.mjs` -> `setCssVariable()` to use `Neo.windowConfigs[windowId].themes`.
3. `src/component/Base.mjs` -> `getTheme()` to use `Neo.windowConfigs[windowId].themes`.

## Timeline

- 2026-03-19T15:13:42Z @tobiu added the `bug` label
- 2026-03-19T15:13:43Z @tobiu added the `ai` label
- 2026-03-19T15:13:56Z @tobiu assigned to @tobiu
- 2026-03-19T15:15:02Z @tobiu referenced in commit `0f04427` - "fix: SharedWorker theme resolution for child windows (#9519)"
### @tobiu - 2026-03-19T15:15:55Z

**Input from Gemini 3.1 Pro:**

> ✦ The theme resolution bug for subsequent windows has been fully resolved.
> 
> The core issue was that child applications connecting via SharedWorkers were falling back to the original Portal's `Neo.config.themes` during CSS injection and variable setting. This caused new windows with distinct theme requirements (e.g. `neo-theme-cyberpunk` vs `neo-theme-dark`) to incorrectly inherit the portal's theme rules.
> 
> The comprehensive fix decoupled theme operations from the static global `Neo.config` by ensuring that context is pulled directly from `Neo.windowConfigs[windowId]`:
> 
> 1.  **`src/worker/App.mjs`**: `insertThemeFiles()` was updated to use the window-specific configuration object when checking for the presence of themes.
> 2.  **`src/worker/App.mjs`**: `setCssVariable()` was similarly updated to use the window-specific configuration for setting dynamic CSS variables correctly within the requested theme environment.
> 3.  **`src/component/Base.mjs`**: The `getTheme()` method, which walks up the VDOM tree, was updated to use `Neo.windowConfigs[me.windowId]` as the fallback instead of the global `Neo.config`.
> 
> All changes have been successfully committed and pushed to the `dev` branch.

- 2026-03-19T15:16:33Z @tobiu closed this issue

