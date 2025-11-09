---
id: 7148
title: Create a Robust VDOM-to-String Serializer
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T23:06:15Z'
updatedAt: '2025-08-02T12:47:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7148'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:47:27Z'
---
# Create a Robust VDOM-to-String Serializer

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
The `JSON.stringify` + regex method for generating the VDOM string during the build process is flawed. It incorrectly handles object keys that are not valid JavaScript identifiers (e.g., `data-foo`) and produces non-idiomatic code (quoted keys). A dedicated serializer is required for correctness and code quality.

**Implementation Details:**
- **Tool:** A new, custom utility module.
- **Location:** `buildScripts/util/vdomToString.mjs`.
- **Method:**
    1. The utility will export a `vdomToString(vdom)` function that recursively traverses the VDOM object.
    2. It will check if each object key is a valid JavaScript identifier.
    3. Valid identifiers will be written to the output string without quotes (e.g., `tag:`).
    4. Invalid identifiers (e.g., `data-foo`) will be correctly wrapped in single quotes (e.g., `'data-foo':`).
    5. It will handle the build-time placeholders for runtime expressions, outputting them as raw, unquoted code.
    6. This new utility will completely replace the `JSON.stringify` and subsequent regex calls in the build scripts.

## Comments

### @tobiu - 2025-08-02 12:47

resolved

