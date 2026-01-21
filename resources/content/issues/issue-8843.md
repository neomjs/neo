---
id: 8843
title: Persist Portal Theme Selection
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T09:35:06Z'
updatedAt: '2026-01-21T09:54:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8843'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T09:54:00Z'
---
# Persist Portal Theme Selection

Enable persistence of the user's theme preference (Light/Dark) in the Portal App using LocalStorage.

**Requirements:**
1.  **Save Preference:** Update `ViewportController.onSwitchTheme()` to write the selected theme (e.g., `neo-theme-neo-dark`) to LocalStorage under the key `portalTheme`.
2.  **Restore Preference:** Implement logic on app startup (e.g., in `onConstructed`) to read the `portalTheme` from LocalStorage and apply it to the Viewport.
3.  **Refactor:** Ensure `onSwitchTheme` and the startup logic handle the asynchronous nature of LocalStorage interactions correctly.

**Implementation Details:**
-   Use `Neo.main.addon.LocalStorage`.
-   Context: `apps/portal/view/ViewportController.mjs`.


## Timeline

- 2026-01-21T09:35:07Z @tobiu added the `enhancement` label
- 2026-01-21T09:35:07Z @tobiu added the `ai` label
- 2026-01-21T09:35:58Z @tobiu added parent issue #8727
- 2026-01-21T09:53:07Z @tobiu referenced in commit `7e3646a` - "feat: Persist Portal Theme Selection (#8843)"
- 2026-01-21T09:53:45Z @tobiu assigned to @tobiu
- 2026-01-21T09:54:00Z @tobiu closed this issue
### @tobiu - 2026-01-21T09:54:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the theme persistence logic.
> 
> **Changes:**
> 1.  **Refactored `ViewportController`:** Introduced a centralized `setTheme(theme, updateStorage)` method to handle both UI updates (viewport theme, button icon) and optional LocalStorage persistence.
> 2.  **App Startup:** `onConstructed` now checks LocalStorage for the `portalTheme` key and applies it if found (without re-triggering a write).
> 3.  **Theme Switching:** `onSwitchTheme` now toggles the theme and calls `setTheme` with `updateStorage=true`, ensuring the user's preference is saved.
> 
> The code adheres to the DRY principle and correctly handles the asynchronous nature of LocalStorage reads during the construction phase.


