---
id: 7121
title: 'docs: Create a new tutorial for building a functional component'
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-28T11:15:16Z'
updatedAt: '2025-07-28T11:16:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7121'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-28T11:16:05Z'
---
# docs: Create a new tutorial for building a functional component

The "Describing a View" guide introduces users to the two component models in Neo.mjs. A logical next step is a hands-on tutorial that walks them through creating their own component using the modern, functional approach.

This ticket is to create a new tutorial, "Creating a Custom Functional Button", that serves as a practical, step-by-step guide for new users.

### Tasks
- Create a new tutorial file at `learn/tutorials/CreatingAFunctionalButton.md`.
- The tutorial should guide the user through the following steps:
    1.  Defining a basic functional component with `defineComponent`.
    2.  Adding reactive public configs (e.g., `text_`, `iconCls_`).
    3.  Using the configs within the `createVdom` method to build a dynamic VDOM.
    4.  Implementing event handling by adding a `handler_` and an `onClick` method.
    5.  Providing a complete, live-preview example that demonstrates how to use the newly created custom component within a view.
- The introduction must clarify that Neo.mjs already has a feature-rich functional button (`Neo.functional.button.Base`) and that this tutorial is for educational purposes to teach the core concepts of functional component creation.
- Update `learn/tree.json` to add the new tutorial to the "Tutorials" section, making it discoverable in the navigation tree.

## Timeline

- 2025-07-28T11:15:16Z @tobiu assigned to @tobiu
- 2025-07-28T11:15:18Z @tobiu added the `documentation` label
- 2025-07-28T11:15:18Z @tobiu added the `enhancement` label
- 2025-07-28T11:15:44Z @tobiu referenced in commit `d006480` - "docs: Create a new tutorial for building a functional component #7121"
- 2025-07-28T11:16:06Z @tobiu closed this issue

