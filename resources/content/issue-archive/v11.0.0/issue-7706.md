---
id: 7706
title: Refactor jsdoc-x integration for improved performance and maintainability
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-04T22:00:14Z'
updatedAt: '2025-11-04T22:02:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7706'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T22:02:11Z'
---
# Refactor jsdoc-x integration for improved performance and maintainability

This ticket summarizes the refactoring of the `jsdoc-x` integration within the project. The primary goals were to modernize the codebase, remove outdated dependencies, and improve performance.

**Changes Made:**
*   Removed the `jsdoc-x` package from `package.json`.
*   Added `glob` as a `devDependency` to `package.json`.
*   Introduced 6 new files in `buildScripts/docs/jsdoc-x/` as a module-based (ESM) rewrite of the original `jsdoc-x` library. This rewrite gives kudos to the original author, Onury (https://github.com/onury/jsdoc-x).
*   Adjusted `buildScripts/docs/jsdocx.mjs` to utilize the new `jsdoc-x` implementation.

**Performance Improvement:**
The parsing time for documentation JSON files has significantly improved:
*   **Before:** ~28 seconds
*   **After:** ~7.52 seconds

## Timeline

- 2025-11-04T22:00:16Z @tobiu added the `enhancement` label
- 2025-11-04T22:00:16Z @tobiu added the `ai` label
- 2025-11-04T22:00:50Z @tobiu assigned to @tobiu
- 2025-11-04T22:01:18Z @tobiu referenced in commit `f06f783` - "Refactor jsdoc-x integration for improved performance and maintainability #7706"
- 2025-11-04T22:02:12Z @tobiu closed this issue

