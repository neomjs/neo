---
id: 7790
title: Create a universal ESM bundle for highlight.js
state: OPEN
labels:
  - enhancement
  - dependencies
  - ai
assignees: []
createdAt: '2025-11-18T10:12:43Z'
updatedAt: '2025-11-18T10:12:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7790'
author: tobiu
commentsCount: 0
parentIssue: 7791
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create a universal ESM bundle for highlight.js

To ensure maintainability and compatibility with the Neo.mjs zero-builds dev mode, we must use a single version of `highlight.js` for both client-side and server-side rendering. The SSR process runs the exact same application code as the browser, so a single, universal module is required.

The stock npm package is CommonJS and not suitable for direct browser ESM import.

## Plan

1.  Create a build script (e.g., in `buildScripts/`) that uses the `highlight.js` build tools to generate a custom, universal bundle.
2.  The script must output a single file in **ESM format** (e.g., `highlight.custom.mjs`).
3.  This bundle must include only the languages required for the project: `bash`, `css`, `javascript`, `json`, `scss`, `xml`.
4.  The generated file will be saved into the repository at `resources/lib/highlight/highlight.custom.mjs`.
5.  This single, custom bundle will be the **only** version of `highlight.js` used across the entire platform (Node.js and browser), ensuring consistency and maintainability.

## Activity Log

- 2025-11-18 @tobiu added the `enhancement` label
- 2025-11-18 @tobiu added the `dependencies` label
- 2025-11-18 @tobiu added the `ai` label
- 2025-11-18 @tobiu cross-referenced by #7791

