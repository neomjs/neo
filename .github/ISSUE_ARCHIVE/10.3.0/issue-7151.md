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
closedAt: '2025-08-01T11:06:51Z'
---
# Finalize and Integrate AST-based Build Process

**Reported by:** @tobiu on 2025-08-01

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

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

