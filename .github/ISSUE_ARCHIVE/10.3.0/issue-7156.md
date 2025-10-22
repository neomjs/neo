---
id: 7156
title: Finalize Build-Time AST Transformation
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T16:07:10Z'
updatedAt: '2025-08-02T11:11:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7156'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T11:11:54Z'
---
# Finalize Build-Time AST Transformation

**Reported by:** @tobiu on 2025-08-01

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

This ticket addresses the final, robust implementation of the build-time HTML-to-VDOM conversion. Previous attempts using regex and incomplete AST patching have proven to be brittle. This task will implement a full, proper AST transformation pipeline to ensure correctness and handle all edge cases, including nested templates, complex expressions, and conditional rendering.

#### 2. Rationale

The core problem is that the build process must reliably convert an `html` tagged template literal into a standard JavaScript object (the VDOM) within the source code itself. The process must correctly handle interpolated expressions, converting them into valid AST nodes that can be integrated back into the main file's AST. The previous failures were due to improper string manipulation and parsing, leading to syntax errors. A full AST-based approach is the only way to guarantee a syntactically correct and robust transformation.

#### 3. Scope & Implementation Plan

This task will replace the existing template processing logic in `buildScripts/buildESModules.mjs` with the following, more robust pipeline:

1.  **Parse to AST:** For each input file, use `acorn` to parse the entire source code into a complete Abstract Syntax Tree (AST). Add parent pointers to each node during a walk for easier tree manipulation.

2.  **Post-Order Traversal:** Traverse the AST in post-order (children first). This is critical for correctly handling nested `html` templates, as it ensures the innermost templates are processed and replaced before their parents.

3.  **Identify `html` Templates:** During the traversal, identify all `TaggedTemplateExpression` nodes whose tag is an `Identifier` with the name `html`.

4.  **Process Template to JSON VDOM:** For each identified template node:
  *   Extract the raw strings and the source code of the interpolated expressions.
  *   Use the existing `buildScripts/util/templateBuildProcessor.mjs` to convert this into a serializable JSON VDOM object. This utility is already effective at this specific step, creating placeholders like `##__NEO_EXPR__...##` for dynamic parts.

5.  **Convert JSON VDOM to AST Node:** This is the most critical step. Create a new, robust `jsonToAst` function inside `buildScripts/buildESModules.mjs` that recursively converts the JSON VDOM object from the previous step into a valid `acorn` AST `ObjectExpression` node. This function will:
  *   Correctly handle primitives (string, number, boolean) by creating `Literal` nodes.
  *   Correctly handle arrays by creating `ArrayExpression` nodes.
  *   When it encounters a string that is a placeholder (e.g., `##__NEO_EXPR__(...)##__NEO_EXPR__##`), it will extract the inner expression string, parse *only that expression* with `acorn.parse()`, and insert the resulting `Expression` node directly into the AST. This avoids all previous syntax errors.
  *   When it encounters a component placeholder (`{__neo_component_name__: 'MyComponent'}`), it will create an `Identifier` node.

6.  **Replace Node in Main AST:** Replace the original `TaggedTemplateExpression` node in the main AST with the newly generated `ObjectExpression` node from the previous step.

7.  **Rename `render` method:** As part of the same traversal, if a processed `html` template was inside a method definition or object property named `render`, rename that key to `createVdom`.

8.  **Generate Final Code:** After the traversal and all replacements are complete, use `astring` to generate the final, correct, and human-readable JavaScript code from the modified AST.

9.  **Minify:** Pass the generated code to `Terser` for final minification.

#### 4. Definition of Done

-   The build process no longer produces any parsing or syntax errors related to template conversion.
-   The `buildESModules.mjs` script is updated to use the full AST transformation pipeline described above.
-   The final `dist/esm` output for components with `html` templates is syntactically correct and functionally equivalent to the client-side parsed version.
-   All previous edge cases (conditional rendering, mixed static/dynamic text, self-closing tags) are handled correctly.

## Comments

### @tobiu - 2025-08-02 11:11

this is a huge step forwards for build-time replacements.

<img width="733" height="462" alt="Image" src="https://github.com/user-attachments/assets/94045a4c-f32a-4c30-ad8c-2eedc8298ca8" />

gets transformed into:

<img width="716" height="424" alt="Image" src="https://github.com/user-attachments/assets/f3b285ab-cedb-4620-918d-0d41c1ed1bee" />

