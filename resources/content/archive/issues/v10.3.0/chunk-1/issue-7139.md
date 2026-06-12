---
id: 7139
title: 'Parser: Component vs. HTML Tag Recognition'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T07:34:18Z'
updatedAt: '2025-07-31T08:35:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7139'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-31T08:35:55Z'
---
# Parser: Component vs. HTML Tag Recognition

**Description:**
Implement the logic within the `parse5` processor to differentiate between standard HTML tags and neo.mjs component tags based on the convention defined in the Syntax Specification.

**Implementation Details:**
- When traversing the `parse5` AST, check the tag name of each element.
- If the tag name follows the component convention (e.g., starts with a capital letter), generate a VDOM object with a `module` or `className` property pointing to the corresponding component class.
- If it's a standard HTML tag, generate a standard VDOM object with a `tag` property.
- A mechanism will be needed to resolve the string name (e.g., "GridContainer") to the actual class constructor (`GridContainer`) at runtime. This may involve a component registry or passing a scope object to the template processor.

## Timeline

- 2025-07-31T07:34:18Z @tobiu assigned to @tobiu
- 2025-07-31T07:34:19Z @tobiu added parent issue #7130
- 2025-07-31T07:34:19Z @tobiu added the `enhancement` label
- 2025-07-31T08:35:48Z @tobiu referenced in commit `dd870b1` - "Parser: Component vs. HTML Tag Recognition #7139"
- 2025-07-31T08:35:55Z @tobiu closed this issue

