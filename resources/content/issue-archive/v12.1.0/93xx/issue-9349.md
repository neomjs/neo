---
id: 9349
title: 'build: Fix dirent.path resolution and OS-agnostic pathing in esmodules.mjs'
state: CLOSED
labels:
  - bug
  - windows
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-28T12:18:16Z'
updatedAt: '2026-02-28T12:19:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9349'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-28T12:19:20Z'
---
# build: Fix dirent.path resolution and OS-agnostic pathing in esmodules.mjs

**Describe the bug**
A bug was reported indicating that `dirent.path` is problematic on Windows within `@buildScripts/build/esmodules.mjs`.

**Cause**
In older versions of Node.js or in specific environments, `fs.Dirent` objects might not uniformly expose `.path` (they sometimes use `parentPath` or missing it completely). Furthermore, relying on exact directory name matching via `if (dirent.name === 'resources')` combined with nested manual traversals creates brittle path resolutions when dealing with cross-platform slashes (e.g. `\` vs `/`).

**Solution**
1. Fallback gracefully: `const currentPath = dirent.parentPath || dirent.path;`
2. Normalize all paths before inspection to `/` so string matching is OS-agnostic: `.replace(/\\/g, '/')`.
3. Refactor the `minifyDirectory` to evaluate file-by-file recursively rather than doing an awkward combination of file reading and directory copying inside a single conditional block. This removes the need to parse the `outputPath` to find JSON files within a copied directory.
4. Add a safeguard to only minify `ServiceWorker.mjs` if it actually exists in the root directory.

## Timeline

- 2026-02-28T12:18:18Z @tobiu added the `bug` label
- 2026-02-28T12:18:18Z @tobiu added the `windows` label
- 2026-02-28T12:18:18Z @tobiu added the `ai` label
- 2026-02-28T12:18:18Z @tobiu added the `build` label
- 2026-02-28T12:18:52Z @tobiu referenced in commit `ace0185` - "build: Fix dirent.path resolution and OS-agnostic pathing in esmodules.mjs (#9349)"
### @tobiu - 2026-02-28T12:18:57Z

**Input from Gemini 3.1 Pro:**

> ✦ Fixed the path resolution for Windows and simplified the logic in the latest commit on `dev`.

- 2026-02-28T12:19:06Z @tobiu assigned to @tobiu
- 2026-02-28T12:19:20Z @tobiu closed this issue

