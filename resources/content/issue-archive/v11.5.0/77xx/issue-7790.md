---
id: 7790
title: Create a universal ESM bundle for highlight.js
state: CLOSED
labels:
  - enhancement
  - dependencies
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T10:12:43Z'
updatedAt: '2025-11-18T12:12:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7790'
author: tobiu
commentsCount: 0
parentIssue: 7791
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-18T12:12:48Z'
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

## Implementation Details

We have successfully created a build script that generates a custom `highlight.js` bundle.

The original plan was to use the `highlight.js` build tools directly, but we discovered that the npm package does not include them.

Instead, we have implemented a build script that:
1.  Clones the `highlight.js` repository from GitHub into a temporary directory.
2.  Installs the dependencies.
3.  Runs the `highlight.js` build script to generate a custom bundle with the required languages (`bash`, `css`, `javascript`, `json`, `scss`, `xml`).
4.  Copies the generated bundle and a minified version to the `dist/highlight` directory.
5.  The script is cross-platform compatible and is run automatically after `npm install` via a `postinstall` script. A manual `build-highlightjs` script is also available.

The generated files are placed in the `dist/` folder and are not committed to the repository.

## Timeline

- 2025-11-18T10:12:44Z @tobiu added the `enhancement` label
- 2025-11-18T10:12:45Z @tobiu added the `dependencies` label
- 2025-11-18T10:12:45Z @tobiu added the `ai` label
- 2025-11-18T10:13:13Z @tobiu cross-referenced by #7791
- 2025-11-18T10:13:45Z @tobiu added parent issue #7791
- 2025-11-18T10:16:31Z @tobiu cross-referenced by #7788
- 2025-11-18T10:23:54Z @tobiu assigned to @tobiu
- 2025-11-18T12:09:58Z @tobiu referenced in commit `e56cb71` - "Create a universal ESM bundle for highlight.js #7790"
- 2025-11-18T12:12:48Z @tobiu closed this issue

