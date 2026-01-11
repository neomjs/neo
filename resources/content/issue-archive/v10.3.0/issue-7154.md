---
id: 7154
title: Fix Self-Closing Custom Component Tags
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T14:14:18Z'
updatedAt: '2025-10-22T22:59:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7154'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-01T14:15:13Z'
---
# Fix Self-Closing Custom Component Tags

#### 1. Summary

Implemented a lightweight fix in `HtmlTemplateProcessor.mjs` to correctly handle self-closing custom component tags (e.g., `<MyComponent />` or `<${Button} />`).

#### 2. Rationale

The `parse5` library, while robust for HTML, does not correctly parse self-closing tags for custom elements that are not standard HTML void elements. This would lead to incorrect VDOM structures. The initial thought was to use a full JS parser like `acorn` to identify these, but that would add a significant overhead (~120KB) to the zero-builds development environment. The chosen solution is much more efficient.

#### 3. Scope & Implementation Plan

1.  **Identify the Issue:** Confirmed that `parse5` fails to create a proper AST for templates containing self-closing custom component tags.
2.  **Implement Regex Pre-processing:**
    -   A new regular expression (`selfClosingComponentRegex`) was added to `HtmlTemplateProcessor.mjs`.
    -   This regex specifically finds component tags (identified by starting with a capital letter or being a `neotag` placeholder) that are self-closed (`/>`).
    -   Before passing the template string to `parse5`, a `replace()` call uses this regex to convert the self-closing tag into a standard tag with an explicit closing tag (e.g., `<MyComponent />` becomes `<MyComponent></MyComponent>`).
3.  **Ensure Specificity:** The regex is carefully crafted to *not* affect standard HTML void elements (like `<br>`, `<img>`), ensuring correct HTML parsing is preserved.
4.  **Cleanup:** Removed unused imports for `acorn` and `astring` from `HtmlTemplateProcessor.mjs` as they were no longer needed.

#### 4. Definition of Done

-   `HtmlTemplateProcessor.mjs` now correctly parses templates containing self-closing custom components.
-   The fix is implemented with a minimal performance footprint, avoiding large new dependencies in the development build.
-   Standard HTML void elements are unaffected and continue to parse correctly.
-   Unnecessary `acorn` and `astring` imports have been removed from the processor.

## Timeline

- 2025-08-01T14:14:18Z @tobiu assigned to @tobiu
- 2025-08-01T14:14:19Z @tobiu added the `enhancement` label
- 2025-08-01T14:14:19Z @tobiu added parent issue #7130
- 2025-08-01T14:14:54Z @tobiu referenced in commit `c0c3ffb` - "Fix Self-Closing Custom Component Tags #7154"
- 2025-08-01T14:15:13Z @tobiu closed this issue

