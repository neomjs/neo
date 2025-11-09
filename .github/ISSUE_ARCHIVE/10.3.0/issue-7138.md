---
id: 7138
title: 'Parser: Interpolation and Data Type Handling'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T07:33:13Z'
updatedAt: '2025-07-31T10:25:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7138'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-31T10:25:36Z'
---
# Parser: Interpolation and Data Type Handling

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
Enhance the `parse5` processor to correctly handle the mapping of interpolated values from the tagged template literal to their corresponding VDOM properties, respecting their original data types.

**Implementation Details:**
- The parser must receive not only the HTML string but also the array of interpolated values from the template literal.
- When an attribute value is a placeholder for an interpolated value (e.g., `renderer="$[0]"`, where `$[0]` maps to the first expression), the parser must assign the raw expression value (the function object) to the VDOM config, not the placeholder string.
- Implement logic to correctly handle and assign functions, objects, arrays, and other non-string data types to the appropriate VDOM properties.

## Comments

### @tobiu - 2025-07-31 10:25

resolved via the other subs commits

