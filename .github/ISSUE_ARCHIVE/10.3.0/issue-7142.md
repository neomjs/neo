---
id: 7142
title: Expand Test Coverage with Real Components
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T10:50:51Z'
updatedAt: '2025-08-02T12:48:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7142'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:48:28Z'
---
# Expand Test Coverage with Real Components

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
While the mock component tests are a good start, we need to ensure the template processor works correctly in real-world scenarios with actual functional components and their lifecycle. This involves creating more complex integration tests.

**Implementation Details:**
- **Location:** Create new test files or enhance `test/siesta/tests/functional/HtmlTemplateComponent.mjs`.
- **Scenarios to Test:**
    - Components with nested children defined in the template.
    - Components that use reactive configs passed in via attributes.
    - Templates that include a mix of standard HTML tags and multiple, different neo.mjs components.
    - Edge cases with complex interpolation in attributes and text nodes.
    - Ensure the entire component lifecycle (mount, update, destroy) works as expected when the VDOM is generated from a template.

## Comments

### @tobiu - 2025-08-02 12:48

resolved

