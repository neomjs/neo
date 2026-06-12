---
id: 7151
title: Finalize and Integrate AST-based Build Process
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T10:32:59Z'
updatedAt: '2025-08-01T11:06:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7151'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-01T11:06:51Z'
---
# Finalize and Integrate AST-based Build Process

### 1. Summary

This ticket covers the final integration of the robust, AST-based template processing into the main `build-es-modules` script, and the subsequent cleanup of temporary development scripts.

### 2. Rationale

After proving the AST-based approach in a dedicated script (`buildSingleFile.mjs`), it was necessary to merge this superior logic into the primary build script (`buildESModules.mjs`) that processes the entire project. This ensures that all files benefit from the robust template conversion. Consolidating the logic also simplifies the build toolchain.

### 3. Scope & Implementation Plan

1.  **Integrate Logic:** The `minifyFile` function from `buildSingleFile.mjs`, containing the full AST parsing, transformation, and code generation logic, was moved into `buildESModules.mjs`, replacing the older, less robust implementation.
2.  **Cleanup:** The temporary `buildSingleFile.mjs` script was deleted from the repository.
3.  **Rename Script:** For improved clarity and consistency, the `build-es-modules` npm script in `package.json` was renamed to `build-dist-esm`.

### 4. Definition of Done

-   The `buildESModules.mjs` script now uses the AST-based approach for all files.
-   The temporary `buildSingleFile.mjs` script has been removed.
-   The corresponding npm script has been renamed to `build-dist-esm`.
-   The full build process runs successfully, correctly transforming all `html` templates across the project.

## Timeline

- 2025-08-01T10:32:59Z @tobiu assigned to @tobiu
- 2025-08-01T10:33:00Z @tobiu added the `enhancement` label
- 2025-08-01T10:33:01Z @tobiu added parent issue #7150
- 2025-08-01T10:33:55Z @tobiu removed parent issue #7150
- 2025-08-01T10:33:56Z @tobiu added parent issue #7130
- 2025-08-01T10:34:31Z @tobiu referenced in commit `a267273` - "Finalize and Integrate AST-based Build Process #7151"
- 2025-08-01T11:06:51Z @tobiu closed this issue

