---
id: 8117
title: Enhance theming engine to support additionalThemeFiles
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T20:07:24Z'
updatedAt: '2025-12-15T20:35:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8117'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T20:35:02Z'
---
# Enhance theming engine to support additionalThemeFiles

To handle scenarios where components need to load theme files from namespaces outside their prototype chain (e.g., loading a main app Viewport theme in a child app), we need to introduce a mechanism to specify additional theme files.

This task involves:
1.  Adding `additionalThemeFiles` (String[]) to `Neo.component.Abstract` config.
2.  Updating `Neo.worker.App#insertThemeFiles` to process these additional files, loading them without traversing their prototype chain.

## Timeline

- 2025-12-15T20:07:25Z @tobiu added the `enhancement` label
- 2025-12-15T20:07:25Z @tobiu added the `ai` label
- 2025-12-15T20:08:05Z @tobiu assigned to @tobiu
- 2025-12-15T20:32:59Z @tobiu referenced in commit `a9d1c6e` - "Enhance theming engine to support additionalThemeFiles #8117"
### @tobiu - 2025-12-15T20:34:10Z

**Input from Gemini:**

> ✦ I have implemented the requested changes.
> 
> **Summary of Changes:**
> 1.  **`src/component/Abstract.mjs`**:
>     *   Added `additionalThemeFiles` to the `static config`.
>     *   Updated the JSDoc to include an `@example`.
>     *   Ensured correct config ordering.
> 
> 2.  **`src/worker/App.mjs`**:
>     *   Updated `insertThemeFiles` to handle `additionalThemeFiles`.
>     *   Implemented logic to pass `null` as the prototype when recursively loading additional theme files, ensuring the prototype chain is ignored for these specific files.
>     *   Added `className` to the `themeFilesCache` to support cases where the prototype might be null.
>     *   Utilized optional chaining (`?.`) for cleaner code.
> 
> 3.  **`apps/agentos/childapps/strategy/view/Viewport.mjs`**:
>     *   Added `additionalThemeFiles: ['AgentOS.view.Viewport']` to demonstrate usage and fix the reported theming issue.
> 
> The enhancement is now complete and verified.

- 2025-12-15T20:35:02Z @tobiu closed this issue

