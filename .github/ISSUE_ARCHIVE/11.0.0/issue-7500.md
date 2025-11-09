---
id: 7500
title: Simplify Description Handling in Zod Schema Generation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T14:07:08Z'
updatedAt: '2025-10-15T14:07:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7500'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-15T14:07:37Z'
---
# Simplify Description Handling in Zod Schema Generation

**Reported by:** @tobiu on 2025-10-15

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

The current implementation of `describe()` calls in `buildZodSchemaFromResponse` and `buildOutputZodSchema` can be simplified for better consistency and readability. This ticket aims to centralize the application of descriptions to Zod schemas.

## Acceptance Criteria

1.  `buildZodSchemaFromResponse` is refactored to apply `schema.description` to the generated `zodSchema` consistently for all types.
2.  `buildOutputZodSchema` is refactored to ensure descriptions are applied correctly to the wrapped object for `text/plain` responses.

