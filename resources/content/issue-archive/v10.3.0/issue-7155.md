---
id: 7155
title: Fix Build-Time Conditional Template Rendering
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T14:40:35Z'
updatedAt: '2025-08-01T14:41:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7155'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-01T14:41:14Z'
---
# Fix Build-Time Conditional Template Rendering

#### 1. Summary

Corrected a subtle bug in the build-time parser (`buildScripts/util/templateBuildProcessor.mjs`) that caused it to incorrectly handle conditionally rendered nested templates.

#### 2. Rationale

The build-time parser was wrapping raw JavaScript expressions (like `showDetails && detailsTemplate`) inside a VDOM text node (`{vtype: 'text', text: '...'}`). This prevented the expression from being correctly evaluated at runtime, leading to incorrect output. The client-side parser handled this correctly because it evaluates the expression *before* parsing. The build-time parser needed to be adjusted to produce an equivalent VDOM structure.

#### 3. Scope & Implementation Plan

1.  **Identify the Bug:** Pinpointed the difference in logic between the client-side and build-time `convertNodeToVdom` functions. The build-time version was too aggressive in wrapping dynamic placeholders in text nodes.
2.  **Modify `convertNodeToVdom`:**
    -   The logic in `buildScripts/util/templateBuildProcessor.mjs` was changed.
    -   When the parser encounters a text node that consists *only* of a single dynamic value placeholder (e.g., `${showDetails && detailsTemplate}`), it now returns the raw placeholder value itself (e.g., `##__NEO_EXPR__showDetails && detailsTemplate##__NEO_EXPR__##`).
    -   This ensures the raw expression is inserted directly into the `cn` (children) array of the VDOM, allowing it to be properly evaluated at runtime.
3.  **Align with Client-Side Behavior:** This change brings the build-time parser's output in line with the correct behavior of the client-side parser, ensuring consistency between development and production environments.

#### 4. Definition of Done

-   The build-time parser now correctly handles conditionally rendered nested `html` templates.
-   Expressions that resolve to a template or a falsy value are correctly represented in the final VDOM.
-   The build output for components using this pattern is now functionally correct and matches the client-side rendering logic.

## Timeline

- 2025-08-01T14:40:36Z @tobiu assigned to @tobiu
- 2025-08-01T14:40:37Z @tobiu added the `enhancement` label
- 2025-08-01T14:40:37Z @tobiu added parent issue #7130
- 2025-08-01T14:41:06Z @tobiu referenced in commit `505f9ef` - "Fix Build-Time Conditional Template Rendering #7155"
- 2025-08-01T14:41:14Z @tobiu closed this issue

