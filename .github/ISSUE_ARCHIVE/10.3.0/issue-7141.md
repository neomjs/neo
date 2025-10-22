---
id: 7141
title: Enhance Learning Content
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T10:50:07Z'
updatedAt: '2025-08-02T13:06:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7141'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T13:06:29Z'
---
# Enhance Learning Content

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
Create a comprehensive guide to explain the purpose and trade-offs of using HTML templates. The current syntax-only file is insufficient for developers to make an informed decision. This new content should clearly position templates as an alternative to the core JSON VDOM, aimed at developers familiar with string-based syntaxes.

**Implementation Details:**
- **Location:** Enhance the existing file: `learn/guides/uibuildingblocks/HtmlTemplates.md`.
- **Key Points to Cover:**
    - **The "Why":** Explain that this feature is an alternative, not a replacement, for JSON VDOM, designed to lower the barrier to entry for developers from other framework backgrounds.
    - **The Trade-Offs:** Clearly state that using this feature in development mode requires loading the `parse5` library (~176KB), which has a performance cost compared to the zero-dependency JSON VDOM approach.
    - **Positioning:** Frame it as a "beginner-friendly" or "transitional" option that helps developers get started quickly, while encouraging them to explore the power and performance of the native JSON VDOM as they become more familiar with the framework.
    - **Best Practices:** Provide clear examples of when to use templates and when JSON VDOM might be a better choice (e.g., for highly dynamic or programmatically generated views).

## Comments

### @tobiu - 2025-08-02 13:06

resolved via https://github.com/neomjs/neo/blob/dev/learn/guides/uibuildingblocks/HtmlTemplates.md

