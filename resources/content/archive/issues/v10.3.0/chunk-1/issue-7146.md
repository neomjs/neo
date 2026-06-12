---
id: 7146
title: Fix Conditional Rendering and Add Tests
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T14:56:48Z'
updatedAt: '2025-07-31T14:58:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7146'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-31T14:58:00Z'
---
# Fix Conditional Rendering and Add Tests

**Description:**
Ensured that falsy values (e.g., `false`, `null`, `undefined`) in template interpolations do not render any output, which is the correct and expected behavior for conditional rendering. Added a new test case to `test/siesta/tests/functional/HtmlTemplateComponent.mjs` to verify this functionality by toggling a conditional element and asserting its presence and absence in the VDOM.

## Timeline

- 2025-07-31T14:56:48Z @tobiu assigned to @tobiu
- 2025-07-31T14:56:49Z @tobiu added the `enhancement` label
- 2025-07-31T14:56:49Z @tobiu added parent issue #7130
- 2025-07-31T14:57:54Z @tobiu referenced in commit `a992980` - "Fix Conditional Rendering and Add Tests
#7146"
- 2025-07-31T14:58:00Z @tobiu closed this issue

