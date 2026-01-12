---
id: 7152
title: Showcase Nested Templates and Component Usage
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-01T12:23:41Z'
updatedAt: '2025-08-01T12:24:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7152'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-01T12:24:28Z'
---
# Showcase Nested Templates and Component Usage

### 1. Summary

Created a new example application to demonstrate the capabilities of string-based templates, specifically focusing on nested templates and the inclusion of other Neo.mjs components directly within the template.

### 2. Rationale

A practical example is crucial for developers to understand how to leverage the new HTML template feature effectively. This example highlights advanced usage patterns like template nesting and component composition, which are common in real-world applications. It also serves as a confirmation that the build process (specifically `buildScripts/buildESModules.mjs`) correctly handles these complex scenarios, converting them into optimized JSON VDOM.

### 3. Scope & Implementation Plan

1.  **Create Example Component:** Develop a new functional component at `examples/functional/nestedTemplateComponent/Component.mjs`.
2.  **Implement Nested Templates:** Within the example component, define and use a separate `html` template literal that is then conditionally included within the main component's `html` template.
3.  **Integrate Another Component:** Demonstrate how to include another Neo.mjs component (e.g., `Neo.button.Base`) directly within the `html` template using template interpolation (`<${Button} />`).
4.  **Verify Build Process:** Confirm that the `buildScripts/buildESModules.mjs` script correctly processes this example, converting the nested templates and embedded components into the appropriate JSON VDOM structure during the build.

### 4. Definition of Done

-   A new example component `examples/functional/nestedTemplateComponent/Component.mjs` exists.
-   The example successfully demonstrates nested `html` templates.
-   The example successfully demonstrates the inclusion of another Neo.mjs component within an `html` template.
-   The build process correctly converts this complex template structure into optimized JSON VDOM, as verified by inspecting the `dist/esm` output.

## Timeline

- 2025-08-01T12:23:41Z @tobiu assigned to @tobiu
- 2025-08-01T12:23:42Z @tobiu added the `enhancement` label
- 2025-08-01T12:23:43Z @tobiu added parent issue #7130
- 2025-08-01T12:24:25Z @tobiu referenced in commit `35494c5` - "Showcase Nested Templates and Component Usage #7152"
- 2025-08-01T12:24:29Z @tobiu closed this issue

