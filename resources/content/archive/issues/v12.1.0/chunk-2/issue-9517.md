---
id: 9517
title: 'Workers: Standardize and optimize dynamic imports'
state: CLOSED
labels:
  - ai
  - refactoring
  - build
  - core
assignees:
  - tobiu
createdAt: '2026-03-19T10:11:53Z'
updatedAt: '2026-03-19T10:17:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9517'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-19T10:17:25Z'
---
# Workers: Standardize and optimize dynamic imports

Standardize the dynamic `import()` pattern across all workers (App, Canvas, Data, Task) to improve build stability and performance.

**Changes:**
1.  **Extension Handling:** Adopt the pattern of stripping `.mjs` from the input path and adding it explicitly in the template literal (`../../${path}.mjs`). This provides Webpack with a clearer file extension hint.
2.  **`webpackInclude` Optimization:** Restrict Webpack's search scope to relevant source directories: `apps`, `docs/app`, `examples`, and `src`. This prevents Webpack from parsing high-volume or incompatible directories like `resources`, `test`, or SCSS folders.
3.  **Standardized `webpackExclude`:** Use a consistent exclusion pattern for `buildScripts`, `dist`, and `node_modules`.

**Regex Patterns:**
- Generic modules (Data): `/^(?:apps|docs\/app|examples|src)\/.*\.mjs$/`
- App entry points (App): `/^(?:apps|docs\/app|examples|src)\/.*app\.mjs$/`
- Worker-specific modules (Canvas): `/^(?:apps|examples|src)\/.*canvas\/.*\.mjs$/`
- Worker initialization (Canvas/Task): `/^(?:apps|examples|src)\/.*\/canvas\.mjs$/` (or `task.mjs`)

This resolves build crashes where Webpack attempts to parse non-JavaScript files discovered through overly broad dynamic import contexts.

## Timeline

- 2026-03-19T10:11:54Z @tobiu added the `ai` label
- 2026-03-19T10:11:54Z @tobiu added the `refactoring` label
- 2026-03-19T10:11:55Z @tobiu added the `build` label
- 2026-03-19T10:11:55Z @tobiu added the `core` label
- 2026-03-19T10:16:08Z @tobiu referenced in commit `0eae36c` - "refactor: Workers: Standardize and optimize dynamic imports (#9517)"
- 2026-03-19T10:16:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-19T10:17:00Z

**Input from Gemini 3.1 Pro:**

> ✦ The dynamic `import()` pattern has been standardized and optimized across all workers (App, Canvas, Data, Task).
> 
> Key changes:
> - Restricted `webpackInclude` to `apps`, `docs/app`, `examples`, and `src`.
> - Added `.mjs` extension stripping/adding in template literals for clearer Webpack hints.
> - Standardized `webpackExclude` across all workers.
> 
> This ensures Webpack only parses relevant source files, preventing build crashes caused by incompatible or high-volume non-JS directories.

- 2026-03-19T10:17:25Z @tobiu closed this issue

