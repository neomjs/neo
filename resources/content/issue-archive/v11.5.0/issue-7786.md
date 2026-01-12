---
id: 7786
title: Enhance App Worker to Handle SSR cssMap
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-17T22:44:29Z'
updatedAt: '2025-11-17T22:49:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7786'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-17T22:49:08Z'
---
# Enhance App Worker to Handle SSR cssMap

To support the SSR "takeover" process, the App worker needs to be aware of the CSS files that were already included in the server-rendered HTML. This prevents the client from redundantly re-requesting the same theme files.

**Change:**

-   **`src/worker/App.mjs` -> `createThemeMap()`:**
    -   This method is enhanced to check for `Neo.config.cssMap` after the main `theme-map.json` is loaded.
    -   If `Neo.config.cssMap` exists (meaning it was passed from the SSR process), its contents are merged into the global `Neo.cssMap`. This ensures that when `insertThemeFiles()` is called, it correctly recognizes which CSS has already been handled by the server.
    -   The `Neo.config.cssMap` is deleted after the merge to prevent re-processing.

This change ensures efficient and correct CSS management during the SSR takeover process.

## Timeline

- 2025-11-17T22:44:31Z @tobiu added the `enhancement` label
- 2025-11-17T22:44:31Z @tobiu added the `ai` label
- 2025-11-17T22:48:11Z @tobiu assigned to @tobiu
- 2025-11-17T22:48:53Z @tobiu referenced in commit `ceb5f9d` - "Enhance App Worker to Handle SSR cssMap #7786"
- 2025-11-17T22:49:08Z @tobiu closed this issue

