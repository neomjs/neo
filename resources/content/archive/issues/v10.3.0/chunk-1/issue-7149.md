---
id: 7149
title: Refactor Build-Time Parser to be AST-Based for Robustness
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T23:06:58Z'
updatedAt: '2025-08-02T12:47:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7149'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-02T12:47:14Z'
---
# Refactor Build-Time Parser to be AST-Based for Robustness

**Description:**
The current build-time approach, which uses regular expressions to find and replace templates, has proven to be brittle and incorrect. It cannot handle nested `html` templates and can be easily fooled by JSDoc comments or strings that happen to contain the `html`` sequence, leading to build failures. To ensure correctness and consistency with the runtime environment, the build process must be refactored to use a proper JavaScript parser.

**Implementation Details:**
- **Tools:** `acorn` (to parse JS into an Abstract Syntax Tree) and `astring` (to generate JS code from the AST).
- **Method:**
    1. In the build script, for each `.mjs` file, use `acorn` to parse the entire file content into an AST.
    2. Traverse the AST, specifically looking for `TaggedTemplateExpression` nodes where the `tag` is an `Identifier` with the name `html`.
    3. Process these template nodes recursively (post-order traversal) to correctly handle nested templates from the inside out.
    4. The logic from `HtmlTemplateProcessorLogic` will be used to convert the template into its VDOM object representation.
    5. The original `TaggedTemplateExpression` node in the AST will be replaced with a new AST node representing the generated VDOM object (using an object-to-AST converter).
    6. Finally, use `astring` to generate the final, correct JavaScript code from the modified AST.
    7. This new, robust process will replace the fragile regex-based `replace` loop.

## Timeline

- 2025-07-31T23:06:59Z @tobiu assigned to @tobiu
- 2025-07-31T23:07:00Z @tobiu added the `enhancement` label
- 2025-07-31T23:07:00Z @tobiu added parent issue #7130
### @tobiu - 2025-08-02T12:47:14Z

resolved

- 2025-08-02T12:47:14Z @tobiu closed this issue

