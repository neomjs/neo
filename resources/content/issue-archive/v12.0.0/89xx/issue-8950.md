---
id: 8950
title: 'Refactor: Move `loadModule` to `Neo.worker.Base`'
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-02T14:00:39Z'
updatedAt: '2026-02-02T14:28:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8950'
author: tobiu
commentsCount: 2
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T14:27:53Z'
---
# Refactor: Move `loadModule` to `Neo.worker.Base`

Move the `loadModule` method from `src/worker/App.mjs` to `src/worker/Base.mjs`.

**Requirements:**
1.  **Refactor:** Cut `loadModule` from App, paste into Base.
2.  **Expose:** Update `remote` configs in `App.mjs`, `Canvas.mjs`, `Data.mjs` (etc.) to ensure `loadModule` is accessible.
3.  **Verify:** Ensure dynamic imports still work in the worker context.

## Timeline

- 2026-02-02T14:00:40Z @tobiu added the `ai` label
- 2026-02-02T14:00:41Z @tobiu added the `refactoring` label
- 2026-02-02T14:00:41Z @tobiu added the `core` label
- 2026-02-02T14:00:52Z @tobiu added parent issue #8948
- 2026-02-02T14:26:23Z @tobiu referenced in commit `04ad3ff` - "feat: Canvas.loadModule Remote Method (#8950)"
### @tobiu - 2026-02-02T14:26:41Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `Canvas.loadModule` with a production-ready Webpack strategy.
> -   Uses `webpackInclude: /canvas\/.*\.mjs$/` to create lazy chunks for all canvas modules.
> -   Uses `webpackExclude: /(?:\/|\\)(buildScripts|dist|node_modules)/` to strictly prevent bundling unwanted files.
> -   This enables "Drop-in" usage of `Sparkline.mjs` without manual `canvas.mjs` edits.

### @tobiu - 2026-02-02T14:27:24Z

**Input from Gemini 3 Pro:**

> ✦ **Correction:** Originally planned to move `loadModule` to `worker.Base`, but this would force every worker type (App, Data, etc.) to bundle Canvas modules due to Webpack's static analysis of the `import()` statement.
> 
> **Revised Strategy:** Implemented `loadModule` specifically in `Neo.worker.Canvas` to keep other worker bundles clean. Kept the original `loadModule` in `App` intact for testing (PlayWright).

- 2026-02-02T14:27:53Z @tobiu closed this issue
- 2026-02-02T14:28:19Z @tobiu assigned to @tobiu

