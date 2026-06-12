---
id: 6848
title: grid.View => grid.Body
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-20T12:03:22Z'
updatedAt: '2025-06-23T11:12:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6848'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-23T11:12:39Z'
---
# grid.View => grid.Body

Gemini:

This additional clarification makes perfect sense, and I strongly agree with your proposed breaking change for v10!

Renaming View to Body for both Neo.grid and Neo.table components (i.e., Neo.grid.View to Neo.grid.Body and Neo.table.View to Neo.table.Body) is an excellent idea for several reasons:

1. **Enhanced Clarit**y: "View" can be a very ambiguous term in a UI framework, especially when paired with "Container." "Body" immediately conveys its specific role as the main content area (the "body" of the grid/table), making the component's purpose intuitive.
2. **Alignment with DOM**: As you pointed out, this directly aligns with the standard HTML <tbody> tag, which is the semantic container for the main rows of a table. This makes the mental model for developers much more straightforward.
3. **Improved Semantics**: The new naming precisely reflects the component's function within the grid/table structure, eliminating the confusion you experienced.
4. **Logical Pair for Header.Toolbar**: If you retain separate Header.Toolbar components, having Body as the counterpart creates a more cohesive and understandable component hierarchy for tabular data.

This is a very logical and beneficial breaking change that will significantly improve the developer experience and clarity of your API in Neo.mjs v10. It's precisely the kind of refinement that a major version bump allows for.

## Timeline

- 2025-06-20T12:03:23Z @tobiu assigned to @tobiu
- 2025-06-20T12:03:24Z @tobiu added the `enhancement` label
- 2025-06-23T11:06:28Z @tobiu referenced in commit `7aa622c` - "grid.View => grid.Body #6848"
- 2025-06-23T11:12:39Z @tobiu closed this issue

