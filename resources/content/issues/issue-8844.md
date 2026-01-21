---
id: 8844
title: Auto-detect System Theme Preference
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T10:06:44Z'
updatedAt: '2026-01-21T10:26:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8844'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T10:26:40Z'
---
# Auto-detect System Theme Preference

Improve UX by automatically detecting the user's system-level color scheme preference (Dark/Light Mode) and using it as the default theme if no user preference is saved.

**Requirements:**
1.  **Detection:** In the Main Thread (`src/Main.mjs`), detect the system preference using `window.matchMedia('(prefers-color-scheme: dark)').matches`.
2.  **Config Propagation:** Store this boolean value in `Neo.config` as `prefersDarkTheme` so it is automatically passed to the App Worker during initialization.
3.  **App Logic:** Update `Portal.view.ViewportController` to use `Neo.config.prefersDarkTheme` as the default fallback when no `portalTheme` is found in LocalStorage.

**Note:** This ensures the first-time visit respects the user's OS settings.


## Timeline

- 2026-01-21T10:06:46Z @tobiu added the `enhancement` label
- 2026-01-21T10:06:46Z @tobiu added the `ai` label
- 2026-01-21T10:07:07Z @tobiu added parent issue #8727
- 2026-01-21T10:25:48Z @tobiu referenced in commit `b59d41f` - "feat: Auto-detect System Theme Preference (#8844)"
### @tobiu - 2026-01-21T10:26:16Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the auto-detection logic.
> 
> **Changes:**
> 1.  **Updated `DefaultConfig.mjs`:** Added `prefersDarkTheme` (default: `false`) with clear documentation.
> 2.  **Updated `src/worker/Manager.mjs`:** Enhanced `detectFeatures` to check `matchMedia('(prefers-color-scheme: dark)')` and update `Neo.config.prefersDarkTheme` *before* workers are created. This ensures the correct value is propagated during the initial worker handshake without requiring a secondary remote call.
> 3.  **Updated `ViewportController.mjs`:** Modified `onConstructed` to use `Neo.config.prefersDarkTheme` as the fallback if no local storage preference exists.
> 
> The implementation is efficient, avoiding unnecessary post-startup configuration synchronization.

- 2026-01-21T10:26:27Z @tobiu assigned to @tobiu
- 2026-01-21T10:26:40Z @tobiu closed this issue

