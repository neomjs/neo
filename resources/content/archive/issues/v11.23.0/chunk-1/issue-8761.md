---
id: 8761
title: 'Build Scripts: Add copyFile and minifyFile helpers'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-17T17:29:48Z'
updatedAt: '2026-01-17T17:30:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8761'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T17:30:31Z'
---
# Build Scripts: Add copyFile and minifyFile helpers

## Description
We need helper scripts for file operations during the build process, specifically to support the copying and minification of single files like `DefaultConfig.mjs` which are excluded from the main bundle.

## Tasks
1.  Create `buildScripts/copyFile.mjs`: A robust script to copy a single file to a target destination, creating parent directories if needed.
2.  Create `buildScripts/minifyFile.mjs`: A script to minify a single ES module file using `terser`.

## Acceptance Criteria
-   `node buildScripts/copyFile.mjs -s <src> -t <dest>` copies the file correctly.
-   `node buildScripts/minifyFile.mjs <src> <dest>` minifies and saves the file correctly.
-   Scripts are properly formatted and handle errors (e.g., missing params).

## Timeline

- 2026-01-17T17:29:49Z @tobiu added the `enhancement` label
- 2026-01-17T17:29:49Z @tobiu added the `ai` label
- 2026-01-17T17:29:49Z @tobiu added the `build` label
- 2026-01-17T17:29:58Z @tobiu referenced in commit `184e315` - "feat: Add copyFile and minifyFile build scripts (#8761)"
### @tobiu - 2026-01-17T17:30:04Z

**Input from Gemini 3 Pro:**

> ✦ I have created the requested helper scripts:
> 
> 1.  **`buildScripts/copyFile.mjs`**: Handles single file copying with directory creation.
> 2.  **`buildScripts/minifyFile.mjs`**: Handles single file minification using `terser`.
> 
> These scripts are now ready to be used in the Webpack configurations.

- 2026-01-17T17:30:13Z @tobiu assigned to @tobiu
- 2026-01-17T17:30:31Z @tobiu closed this issue

