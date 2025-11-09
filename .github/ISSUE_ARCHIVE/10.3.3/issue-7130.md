---
id: 7130
title: String-Based VDOM Templates
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2025-07-30T11:00:58Z'
updatedAt: '2025-08-03T01:09:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7130'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7131
  - 7132
  - 7136
  - 7137
  - 7138
  - 7139
  - 7140
  - 7141
  - 7142
  - 7143
  - 7144
  - 7146
  - 7147
  - 7148
  - 7149
  - 7150
  - 7151
  - 7152
  - 7153
  - 7154
  - 7155
  - 7156
  - 7158
  - 7159
  - 7160
  - 7161
  - 7162
  - 7163
subIssuesCompleted: 28
subIssuesTotal: 28
closedAt: '2025-08-03T01:09:44Z'
---
# String-Based VDOM Templates

**Reported by:** @tobiu on 2025-07-30

---

**Sub-Issues:** #7131, #7132, #7136, #7137, #7138, #7139, #7140, #7141, #7142, #7143, #7144, #7146, #7147, #7148, #7149, #7150, #7151, #7152, #7153, #7154, #7155, #7156, #7158, #7159, #7160, #7161, #7162, #7163
**Progress:** 28/28 completed (100%)

---

This epic covers the exploration and implementation of a new feature allowing developers to use string-based template literals (HTML-like syntax) to define the VDOM for functional components. This will provide a more familiar and intuitive way to structure component views compared to the current JSON-based VDOM approach.

An early proof-of-concept (PoC) already exists in the following files:
- `test/siesta/tests/functional/HtmlTemplateComponent.mjs`
- `src/functional/component/Base.mjs` (see `enableHtmlTemplates_` config)
- `src/functional/util/html.mjs`

## Comments

### @tobiu - 2025-08-03 01:09

resolved via v10.3.0

