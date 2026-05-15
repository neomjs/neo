---
id: 8762
title: 'Webpack: Migrate All Worker Builds to Native ESM Output'
state: CLOSED
labels:
  - ai
  - architecture
  - performance
  - build
assignees:
  - tobiu
createdAt: '2026-01-17T18:01:26Z'
updatedAt: '2026-01-17T18:22:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8762'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T18:22:02Z'
---
# Webpack: Migrate All Worker Builds to Native ESM Output

## Description
Following the successful modernization of the Main Thread build (Ticket #8760), we are extending the Native ESM Output strategy to all Worker builds.

**This is a significant architectural shift.** By enabling `experiments: { outputModule: true }` and `output.library: { type: 'module' }` across the board, we are instructing Webpack to generate true ECMAScript Modules for all worker bundles (App, Data, VDom, etc.).

**Benefits:**
1.  **Consistency:** Unifies the build output format across the entire framework.
2.  **Performance:** Native ESM can be more efficient for browsers to parse and execute compared to Webpack's legacy wrapper boilerplate.
3.  **Future-Proofing:** Aligns the framework with modern web standards and prepares it for features like Top-Level Await (TLA) in workers.
4.  **Simplified Chunk Loading:** Enables `publicPath: 'auto'`, allowing native `import()` to resolve chunks relative to the worker file, eliminating the need for manual path patching logic.

## Scope
Apply the following changes to all development and production configurations for App Workers and generic Workers:
-   `buildScripts/webpack/development/webpack.config.appworker.mjs`
-   `buildScripts/webpack/development/webpack.config.worker.mjs`
-   `buildScripts/webpack/production/webpack.config.appworker.mjs`
-   `buildScripts/webpack/production/webpack.config.worker.mjs`

## Changes Required
1.  Add `experiments: { outputModule: true }`.
2.  Set `output.library: { type: 'module' }`.
3.  Set `output.publicPath: 'auto'` (replacing empty string `''`).
4.  Ensure `target` remains `webworker`.

## Acceptance Criteria
-   All worker bundles (`appworker.js`, `dataworker.js`, `vdomworker.js`, etc.) are generated as valid ES Modules.
-   Application boots and functions correctly in both Development and Production builds.
-   Dynamic imports inside workers resolve correctly.

## Timeline

- 2026-01-17T18:01:27Z @tobiu added the `ai` label
- 2026-01-17T18:01:27Z @tobiu added the `architecture` label
- 2026-01-17T18:01:28Z @tobiu added the `performance` label
- 2026-01-17T18:01:28Z @tobiu added the `build` label
- 2026-01-17T18:21:31Z @tobiu referenced in commit `d0dbefd` - "feat: Migrate All Worker Builds to Native ESM Output (#8762)"
### @tobiu - 2026-01-17T18:21:34Z

**Input from Gemini 3 Pro:**

> ✦ I have migrated all Worker builds (App Worker and generic Workers) to use Native ESM Output in both Development and Production environments.
> 
> **Changes Applied:**
> -   Enabled `experiments: { outputModule: true }` in all relevant Webpack configs.
> -   Set `output.library: { type: 'module' }` to generate true ES modules.
> -   Set `output.publicPath: 'auto'` to leverage native ESM chunk resolution.
> 
> **Files Modified:**
> -   `buildScripts/webpack/development/webpack.config.appworker.mjs`
> -   `buildScripts/webpack/development/webpack.config.worker.mjs`
> -   `buildScripts/webpack/production/webpack.config.appworker.mjs`
> -   `buildScripts/webpack/production/webpack.config.worker.mjs`
> 
> **Verification:**
> -   User confirmed `npm run build-all` completes successfully.
> -   User confirmed apps in `dist` environment launch and function correctly.
> 
> This completes the architectural shift to a unified, ESM-first build system for Neo.mjs.

- 2026-01-17T18:21:39Z @tobiu assigned to @tobiu
- 2026-01-17T18:22:02Z @tobiu closed this issue

