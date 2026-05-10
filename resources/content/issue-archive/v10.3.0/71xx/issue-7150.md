---
id: 7150
title: Build-Time `html` Template to VDOM Conversion
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T10:09:09Z'
updatedAt: '2025-08-01T10:09:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7150'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-01T10:09:56Z'
---
# Build-Time `html` Template to VDOM Conversion

### 1. Summary

Implement a build-time process to convert `html` tagged template literals into JSON-based VDOM structures. This is a critical optimization that removes the need for a client-side HTML parser, leading to smaller bundle sizes and faster initial render times.

### 2. Rationale

Pre-processing templates at build time is a best practice in modern web development. It shifts the parsing overhead from the user's browser to the developer's machine, resulting in a better user experience. This also opens the door for more advanced static analysis and optimizations in the future. By converting templates to standard JSON VDOM, we align this new syntax with the core rendering engine of Neo.mjs, ensuring consistency and maintainability.

### 3. Scope & Implementation Plan

1.  **Isolate Processor Logic:** Refactor the template parsing logic out of the client-side `HtmlTemplateProcessor` and into a dedicated build script utility (`buildScripts/util/templateBuildProcessor.mjs`).
2.  **AST-Based Parsing:** Use `acorn` to parse JavaScript files into an Abstract Syntax Tree (AST), providing a robust way to find templates.
3.  **Find & Process Templates:** Traverse the AST to locate all `TaggedTemplateExpression` nodes tagged with the `html` identifier.
4.  **Convert to VDOM:** For each found template, use the `templateBuildProcessor` to convert it into a JSON VDOM object. This process correctly handles nested templates and embedded JavaScript expressions.
5.  **Rename `render` to `createVdom`:** While traversing the AST, if an `html` template is found within a method or object property named `render`, rename that method/property to `createVdom`.
6.  **Replace in AST:** Replace the original `TaggedTemplateExpression` node in the AST with the newly generated VDOM object (represented as an AST `ObjectExpression`).
7.  **Generate Final Code:** Use `astring` to generate the final, modified JavaScript code from the updated AST.
8.  **Integrate into Build:** Incorporate this AST-based transformation into the `buildSingleFile.mjs` and `buildESModules.mjs` scripts.

### 4. Definition of Done

-   The build process correctly identifies and converts `html` templates to VDOM objects.
-   The `render` method/property is automatically renamed to `createVdom` when it contains an `html` template.
-   The final minified output contains JSON VDOM, not template literals.
-   The client-side `HtmlTemplateProcessor` is no longer required for production builds using this feature.
-   The logic is cleanly separated, with no build-time code included in client-side bundles.

## Timeline

- 2025-08-01T10:09:10Z @tobiu assigned to @tobiu
- 2025-08-01T10:09:11Z @tobiu added parent issue #7130
- 2025-08-01T10:09:12Z @tobiu added the `enhancement` label
- 2025-08-01T10:09:46Z @tobiu referenced in commit `144924d` - "Build-Time html Template to VDOM Conversion #7150"
- 2025-08-01T10:09:56Z @tobiu closed this issue
- 2025-08-01T10:33:01Z @tobiu added sub-issue #7151
- 2025-08-01T10:33:55Z @tobiu removed sub-issue #7151

