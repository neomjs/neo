---
id: 7069
title: Enhance LivePreview for Modern JavaScript and Functional Components
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T23:45:12Z'
updatedAt: '2025-07-15T23:46:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7069'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T23:46:07Z'
---
# Enhance LivePreview for Modern JavaScript and Functional Components

## Problem

The `LivePreview` component, which is essential for interactive documentation and tutorials, had several limitations that hindered its ability to run modern JavaScript examples, particularly those using functional components and named imports.

1.  **No Named Import Support:** The component could only parse default imports (e.g., `import Foo from ...`), failing on named imports (e.g., `import { bar } from ...`). This prevented the use of hooks and other modular utilities in live examples.

2.  **Fragile Class Detection:** The mechanism for identifying the main component to render relied on a regular expression (`classDeclarationRegex`) that searched for the `class ...` syntax. This approach failed for components created with factory functions, such as `defineComponent()`, which do not use the `class` keyword directly.

3.  **Imprecise Component Validation:** The check to ensure the identified class was a renderable component was either too broad (checking for `Neo.core.Base`, which could include data stores) or too narrow. This could lead to errors or prevent valid components from rendering.

## Solution

To address these issues, the `LivePreview.mjs` component was significantly refactored:

1.  **Enhanced Import Parsing:** The `importRegex` was updated to correctly parse both default and named import syntax. The logic in `doRunSource()` was adjusted to generate the correct variable declarations (`const Foo = ...` for default, and `const {bar} = ...` for named).

2.  **Robust Component Identification:** The unreliable `findLastClassName()` method was replaced with `findSetupClassName()`. This new method uses a more robust regex (`setupClassRegex`) to find the variable assigned the result of `Neo.setupClass(...)`. This is a far more reliable pattern for identifying the primary component, regardless of whether it was defined with `class` or a factory function.

3.  **Specific Component Type Check:** The validation logic was improved to explicitly check if the resolved class is a prototype of either `Neo.component.Base` or `Neo.functional.component.Base`. This ensures that only renderable UI components are passed to the container, preventing errors with other base classes.

## Timeline

- 2025-07-15T23:45:13Z @tobiu assigned to @tobiu
- 2025-07-15T23:45:14Z @tobiu added the `enhancement` label
- 2025-07-15T23:45:14Z @tobiu added parent issue #6992
- 2025-07-15T23:45:58Z @tobiu referenced in commit `b290bdf` - "Enhance LivePreview for Modern JavaScript and Functional Components #7069"
- 2025-07-15T23:46:07Z @tobiu closed this issue

