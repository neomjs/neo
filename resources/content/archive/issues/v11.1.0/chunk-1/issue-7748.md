---
id: 7748
title: 'Bug: `copySeoFiles.mjs` Fails to Copy SEO Files to Correct `dist` Paths for Applications'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-11T18:27:04Z'
updatedAt: '2025-11-11T18:28:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7748'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-11T18:28:44Z'
---
# Bug: `copySeoFiles.mjs` Fails to Copy SEO Files to Correct `dist` Paths for Applications

Two critical bugs have been identified in `buildScripts/copySeoFiles.mjs` that prevent the correct copying of SEO files (`robots.txt`, `llm.txt`, `sitemap.xml`) to application build directories.

**Identified Bugs:**

1.  **Incorrect `dist` path construction:**
    *   The script currently constructs target `dist` paths like `dist/<env>/<app-name>`.
    *   This is incorrect for the Neo.mjs project structure, which requires an `apps` segment: `dist/<env>/apps/<app-name>`.
    *   This leads to warnings such as `Warning: Target directory .../dist/production/portal does not exist. Skipping SEO file copy.` because the expected directory structure is not being targeted.

2.  **Incomplete handling of nested application paths:**
    *   When dealing with nested applications (e.g., `apps/sharedcovid/childapps/sharedcovidmap`), the script incorrectly derives the application name using `path.basename(appRootPath)`. This results in `sharedcovidmap` instead of the full relative path `sharedcovid/childapps/sharedcovidmap`.
    *   Consequently, the `dist` path construction fails for these nested apps, leading to similar "Target directory does not exist" warnings.

3.  **Omission of `esm` environment:**
    *   The `copySeoFilesForApp` function currently only considers `development` and `production` environments for copying SEO files.
    *   The `esm` build output is not included, meaning SEO files are not deployed for `esm` builds when the `--env all` or `--env esm` options are used.

**Impact:**

These bugs prevent SEO files from being correctly deployed to application `dist` folders, which can negatively impact search engine discoverability and AI model consumption for deployed applications.

**Proposed Fixes:**

1.  **Refactor `findAppRoots`:**
    *   Modify `findAppRoots` to return an object containing both the absolute `appRootPath` and the `appRelativePath` (the path relative to the `apps/` directory).

2.  **Refactor `copySeoFilesForApp`:**
    *   Update `copySeoFilesForApp` to accept and utilize the `appRelativePath`.
    *   Construct the `targetDistDir` using `path.join(DIST_DIR, targetEnv, 'apps', appRelativePath)` to correctly include the `apps` segment and handle nested paths.
    *   Modify the `targetEnvs` array population logic to include `'esm'` when the build environment (`env`) is `'all'` or `'esm'`.

**Acceptance Criteria:**

-   SEO files are correctly copied to `dist/<env>/apps/<app-name>` for all identified applications, including nested ones.
-   SEO files are copied for `development`, `production`, and `esm` environments as appropriate based on the `--env` parameter.
-   No "Target directory does not exist" warnings related to SEO file copying are observed for valid application `dist` paths.

## Timeline

- 2025-11-11T18:27:04Z @tobiu assigned to @tobiu
- 2025-11-11T18:27:05Z @tobiu added the `bug` label
- 2025-11-11T18:27:05Z @tobiu added the `ai` label
- 2025-11-11T18:27:28Z @tobiu added parent issue #7446
- 2025-11-11T18:27:56Z @tobiu referenced in commit `d0ee445` - "Bug: copySeoFiles.mjs Fails to Copy SEO Files to Correct dist Paths for Applications #7748"
- 2025-11-11T18:28:44Z @tobiu closed this issue

