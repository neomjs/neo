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
closedAt: '2025-07-31T14:58:00Z'
---
# Fix Conditional Rendering and Add Tests

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
Ensured that falsy values (e.g., `false`, `null`, `undefined`) in template interpolations do not render any output, which is the correct and expected behavior for conditional rendering. Added a new test case to `test/siesta/tests/functional/HtmlTemplateComponent.mjs` to verify this functionality by toggling a conditional element and asserting its presence and absence in the VDOM.

