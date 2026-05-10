---
id: 8760
title: 'Webpack: Exclude DefaultConfig from Bundles'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-17T17:01:53Z'
updatedAt: '2026-01-17T17:57:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8760'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T17:57:08Z'
---
# Webpack: Exclude DefaultConfig from Bundles

## Description
For production builds (`dist/production` and `dist/development`), we rely on Webpack bundles. Currently, `DefaultConfig.mjs` might be bundled into the main chunk. To support the "Network First" strategy for version handshakes (Ticket #TBD), `DefaultConfig.mjs` must be excluded from the bundle so it can be requested independently and bypassed by the Service Worker's caching logic.

## Tasks
1.  Analyze current Webpack configuration for `dist/production` and `dist/development` builds.
2.  Configure Webpack to exclude `src/DefaultConfig.mjs` from the main bundle.
3.  Ensure `DefaultConfig.mjs` is copied/available as a standalone file in the output directory.
4.  Verify that the application correctly loads the external `DefaultConfig.mjs` at runtime.

## Acceptance Criteria
-   `DefaultConfig.mjs` is NOT part of the main Webpack bundle in `dist` builds.
-   The file exists as a separate asset in the build output.
-   The application boots correctly in `dist/production` mode.

## Timeline

- 2026-01-17T17:01:54Z @tobiu added the `enhancement` label
- 2026-01-17T17:01:54Z @tobiu added the `ai` label
- 2026-01-17T17:01:54Z @tobiu added the `build` label
- 2026-01-17T17:56:40Z @tobiu referenced in commit `cd91bf0` - "feat: Exclude DefaultConfig from webpack bundles & Modernize ESM Output (#8760)"
### @tobiu - 2026-01-17T17:56:50Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the task to exclude `DefaultConfig.mjs` from the main bundle, enabling the Network-First strategy for version handshakes.
> 
> **Key Changes:**
> 1.  **Webpack Configuration (Dev & Prod):**
>     -   Configured `externals` to exclude `./DefaultConfig.mjs`.
>     -   Enabled `experiments: { outputModule: true }` and set `output.library.type` to `'module'`. This ensures `main.js` is a native ES module that imports `DefaultConfig.mjs` correctly.
>     -   Updated `output.publicPath` to `'auto'` to fix chunk loading in nested apps (native ESM resolution).
>     -   Added build hooks to copy (and minify for prod) `DefaultConfig.mjs` to the output folder using the new helper scripts.
> 
> 2.  **Codebase Modernization:**
>     -   Removed the legacy `__webpack_require__.p` path patching from `src/main/DeltaUpdates.mjs`. This hack is no longer needed with native ESM output and was causing conflicts.
> 
> **Verification:**
> -   User verified that the Portal App loads correctly in `dist/development` mode.
> -   Confirmed that `main.js` contains a native `import` statement for `DefaultConfig.mjs`.
> -   Confirmed that chunks load correctly regardless of `index.html` location.
> 
> This architectural change robustly solves the version handshake issue and modernizes the build output.

- 2026-01-17T17:56:53Z @tobiu assigned to @tobiu
- 2026-01-17T17:57:08Z @tobiu closed this issue
- 2026-01-17T18:01:27Z @tobiu cross-referenced by #8762

