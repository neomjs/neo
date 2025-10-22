---
id: 7165
title: 'Build Process: Ensure `parse5` bundle exists before template processing'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T16:11:55Z'
updatedAt: '2025-08-02T16:17:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7165'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T16:17:47Z'
---
# Build Process: Ensure `parse5` bundle exists before template processing

**Reported by:** @tobiu on 2025-08-02

## 1. Summary

The build scripts that process HTML templates (`templateBuildProcessor.mjs`) have a dependency on the bundled `dist/parse5.mjs` file. The previous implementation assumed this file existed, which could cause the build to crash if scripts were run in a non-standard order or if the `dist` folder was cleaned without a full rebuild.

## 2. Rationale

A robust build process should not rely on implicit dependencies or a specific order of manual operations. By making the creation of the `parse5` bundle an explicit and early step in the main build script, we eliminate a potential point of failure and make the entire system more predictable and resilient for all developers.

## 3. Scope & Implementation

-   **File Modified:** `buildScripts/buildAll.mjs`
-   **Change:** Added a new step to execute `node ./buildScripts/bundleParse5.mjs` at the beginning of the build process.
-   **Placement:** This step is placed immediately after the optional `npm install` and before any other build tasks (like `buildThemes` or `buildESModules`) are initiated.

## 4. Definition of Done

-   The `buildAll.mjs` script now reliably creates the `parse5` bundle as one of its first actions.
-   The overall build process is more robust, and the implicit dependency within `templateBuildProcessor.mjs` is now satisfied automatically.
-   Developers running the standard `build-all` command will not encounter build failures related to the missing `parse5.mjs` file.

