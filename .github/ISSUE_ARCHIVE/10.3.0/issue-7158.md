---
id: 7158
title: 'Create a Reusable, AST-Based Build-Time Processor'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T11:28:45Z'
updatedAt: '2025-08-02T11:44:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7158'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T11:44:21Z'
---
# Create a Reusable, AST-Based Build-Time Processor

**Reported by:** @tobiu on 2025-08-02

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

Refactor the entire build-time template transformation pipeline out of `buildScripts/buildESModules.mjs` and into a new, self-contained, reusable utility module.

#### 2. Rationale

Currently, the logic for finding and transforming `html` templates is tightly coupled to the `buildESModules.mjs` script. To support template transformation in other build environments (like the Webpack-based `dist/dev` and `dist/production`), this logic must be extracted. Creating a single, reusable processor ensures consistency, reduces code duplication, and makes the build system more modular and maintainable.

#### 3. Scope & Implementation Plan

1.  **Create New Utility:** Create a new file at `buildScripts/util/astTemplateProcessor.mjs`.
2.  **Move Core Logic:**
    *   Move the `jsonToAst` function from `buildESModules.mjs` into the new utility.
    *   Create and export a primary function, e.g., `processFileContent(fileContent)`.
    *   This function will encapsulate the entire transformation pipeline:
        *   Parsing the input string with `acorn`.
        *   Performing the post-order traversal to find `html` templates.
        *   Calling `processHtmlTemplateLiteral()` from `templateBuildProcessor.mjs` to get the VDOM object.
        *   Using the moved `jsonToAst` to convert the VDOM object back into an AST node.
        *   Replacing the original template node in the main AST.
        *   Generating the final, transformed code string with `astring`.
3.  **Refactor `buildESModules.mjs`:**
    *   Remove the moved logic (`jsonToAst`, the traversal, etc.).
    *   Import the new `processFileContent` function from `astTemplateProcessor.mjs`.
    *   In the `minifyFile` function, call `processFileContent()` to transform the file's content before passing it to Terser.

#### 4. Definition of Done

-   The new `buildScripts/util/astTemplateProcessor.mjs` module exists and contains the full transformation logic.
-   `buildESModules.mjs` is simplified and correctly uses the new reusable utility.
-   Running `npm run build-dist-esm` produces the exact same correct output as it does now, confirming the refactoring was successful.

