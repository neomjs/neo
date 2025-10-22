---
id: 7132
title: 'Production Mode: Build-Time Parsing with `parse5`'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T11:02:05Z'
updatedAt: '2025-08-02T12:47:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7132'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:47:46Z'
---
# Production Mode: Build-Time Parsing with `parse5`

**Reported by:** @tobiu on 2025-07-30

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
For production builds, parsing HTML strings in the main thread is inefficient. Instead, we will pre-process the source code, identify the templates, and replace them with their JSON VDOM representation directly in the build output.

**Implementation Details:**
- **Tool:** `parse5` (minified size: ~176KB). This is a robust and spec-compliant HTML parser.
- **Method:**
    1. During the build process, use a regular expression to identify the tagged template literals (e.g., `html`...``).
    2. For each match, use `parse5` to parse the string content into an abstract syntax tree (AST).
    3. Convert the `parse5` AST into the final Neo.mjs VDOM JSON format.
    4. Replace the original template literal in the source code with the generated JSON object.

## Comments

### @tobiu - 2025-08-02 12:47

resolved

