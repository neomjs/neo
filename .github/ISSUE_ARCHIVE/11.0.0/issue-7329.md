---
id: 7329
title: Add missing @reactive tags and fix config JSDoc for trailing underscores
state: CLOSED
labels:
  - bug
  - documentation
assignees:
  - tobiu
createdAt: '2025-10-02T18:01:16Z'
updatedAt: '2025-10-02T18:01:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7329'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-02T18:01:49Z'
---
# Add missing @reactive tags and fix config JSDoc for trailing underscores

**Reported by:** @tobiu on 2025-10-02

This ticket addresses issues with missing `@reactive` JSDoc tags and incorrect JSDoc for reactive configs where the trailing underscore was omitted.
The `add-reactive-tags` script was used to automatically insert missing `@reactive` tags into `src/component/Toast.mjs`, `src/dashboard/Container.mjs`, and `src/grid/Container.mjs`.
Additionally, JSDoc comments for `iconCls_` and `position_` in `src/component/Toast.mjs` were corrected to include the trailing underscore in their `@member` tags, ensuring proper parsing by `neo-jsdoc-x`.

## Files Modified:
* `src/component/Toast.mjs`
* `src/dashboard/Container.mjs`
* `src/grid/Container.mjs`

