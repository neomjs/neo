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
blockedBy: []
blocking: []
closedAt: '2025-10-15T14:07:37Z'
---
# Simplify Description Handling in Zod Schema Generation

The current implementation of `describe()` calls in `buildZodSchemaFromResponse` and `buildOutputZodSchema` can be simplified for better consistency and readability. This ticket aims to centralize the application of descriptions to Zod schemas.

## Acceptance Criteria

1.  `buildZodSchemaFromResponse` is refactored to apply `schema.description` to the generated `zodSchema` consistently for all types.
2.  `buildOutputZodSchema` is refactored to ensure descriptions are applied correctly to the wrapped object for `text/plain` responses.

## Timeline

- 2025-10-15T14:07:08Z @tobiu assigned to @tobiu
- 2025-10-15T14:07:09Z @tobiu added the `enhancement` label
- 2025-10-15T14:07:10Z @tobiu added the `ai` label
- 2025-10-15T14:07:10Z @tobiu added parent issue #7477
- 2025-10-15T14:07:33Z @tobiu referenced in commit `f12a9de` - "Simplify Description Handling in Zod Schema Generation #7500"
- 2025-10-15T14:07:38Z @tobiu closed this issue

