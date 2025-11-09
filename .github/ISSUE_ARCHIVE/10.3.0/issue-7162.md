---
id: 7162
title: Add Error Resilience to AST Processor
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T12:07:16Z'
updatedAt: '2025-08-02T12:10:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7162'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:10:28Z'
---
# Add Error Resilience to AST Processor

**Reported by:** @tobiu on 2025-08-02

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

Wrap the core AST processing logic within `astTemplateProcessor.mjs` in a `try...catch` block to prevent a single file's parsing error from crashing the entire build process.

#### 2. Rationale

The AST transformation is complex. If an edge case or a bug in the processor causes an error while parsing a specific file, the current implementation would throw an exception and halt the entire build. By adding error handling, we can isolate the failure. The processor will log the error for later inspection but return the original, untransformed content for the problematic file, allowing the build to complete successfully for all other files.

#### 3. Scope & Implementation Plan

1.  **Modify `processFileContent`:** In `buildScripts/util/astTemplateProcessor.mjs`, wrap the entire block of code following the initial regex check in a `try...catch (e)` block.
2.  **Implement Error Handling:**
    *   Inside the `catch` block, log a detailed error message to the console, including the error `e` and ideally the path of the file being processed (though we might need to pass the file path into the function for that).
    *   Crucially, the `catch` block should return the original, unmodified `fileContent`, ensuring the build can continue.
3.  **Update Return Value:** Ensure the function signature and return value (`{ content: fileContent, hasChanges: false }`) are consistent in the `catch` path.

#### 4. Definition of Done

-   The `try...catch` block is implemented in `processFileContent`.
-   A parsing error in one file logs a console error but does not stop the build.
-   The file that caused the error is passed through the build untransformed.

