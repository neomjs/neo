---
id: 7707
title: Major Performance & Modernization Refactor of JSDoc Documentation Generation
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-04T22:53:57Z'
updatedAt: '2025-11-04T23:01:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7707'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T23:01:59Z'
---
# Major Performance & Modernization Refactor of JSDoc Documentation Generation

This ticket summarizes a comprehensive refactoring of the JSDoc documentation generation process, significantly improving performance, modernizing the codebase, and enhancing maintainability. This work involved an initial rewrite from CommonJS to ES modules and subsequent optimizations.

**Initial Refactor (Gemini):**
*   **Goal:** Modernize the `jsdoc-x` integration, remove outdated dependencies (`bluebird`, `lodash`, `json-stringify-safe`), and improve maintainability.
*   **Changes:**
    *   Removed the original `jsdoc-x` package from `package.json`.
    *   Added `glob` as a `devDependency` to `package.json`.
    *   Introduced 6 new files in `buildScripts/docs/jsdoc-x/` as a module-based (ESM) rewrite of the original `jsdoc-x` library.
    *   Adjusted `buildScripts/docs/jsdocx.mjs` to utilize the new `jsdoc-x` implementation.
*   **Performance Impact:** Initial parsing time improved from ~28 seconds to ~7.52 seconds.

**Further Optimizations (Claude Sonnet 4.5):**
*   **Goal:** Address performance bottlenecks, particularly in JSDoc parsing, and further refine the codebase.
*   **Key Changes:**
    1.  **Parallel JSDoc Processing (`runner.mjs`):** Implemented parallel processing of JSDoc files by splitting them into chunks and distributing them across workers. This leverages physical CPU cores for optimal performance.
    2.  **Switched from `glob` to `fast-glob` (`index.mjs`):** Replaced `glob` with `fast-glob` for more optimized file scanning, including explicit ignore patterns for `node_modules`, `dist/`, and `docs/output/`.
    3.  **Optimized Custom Processing (`jsdocx.mjs`):
        *   Eliminated `globalThis` pollution with clean namespace trees.
        *   Refactored to single-pass processing, combining multiple loops for efficiency.
        *   Utilized `Map` for O(1) document lookups instead of O(n) array searches.
        *   Implemented a path processing cache to avoid repeated regex operations.
        *   Enabled parallel file writes using `Promise.all()`.
    4.  **Added Total Time Tracking:** Integrated an end-to-end timer to measure the complete documentation generation process.

**Final Performance Results:**
*   **Total time:** ~5.2 seconds
*   **Overall improvement:** Approximately 82% faster than the original implementation (28s → 5.2s).
*   **Breakdown:**
    *   JSDoc Parsing: ~5.0s
    *   Custom Processing: ~0.24s

**Conclusion:**
The primary bottleneck was identified as JSDoc parsing itself. Parallel processing, leveraging physical core counts, proved to be the most impactful optimization. Further significant speed gains would likely require switching to an entirely different parser or implementing incremental builds.

## Timeline

- 2025-11-04T22:53:58Z @tobiu added the `enhancement` label
- 2025-11-04T22:53:58Z @tobiu added the `ai` label
- 2025-11-04T22:53:58Z @tobiu added the `refactoring` label
- 2025-11-04T23:00:36Z @tobiu referenced in commit `e9b416e` - "Major Performance & Modernization Refactor of JSDoc Documentation Generation #7707"
- 2025-11-04T23:01:59Z @tobiu closed this issue

