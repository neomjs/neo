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
blockedBy: []
blocking: []
closedAt: '2025-10-02T18:01:49Z'
---
# Add missing @reactive tags and fix config JSDoc for trailing underscores

This ticket addresses issues with missing `@reactive` JSDoc tags and incorrect JSDoc for reactive configs where the trailing underscore was omitted.
The `add-reactive-tags` script was used to automatically insert missing `@reactive` tags into `src/component/Toast.mjs`, `src/dashboard/Container.mjs`, and `src/grid/Container.mjs`.
Additionally, JSDoc comments for `iconCls_` and `position_` in `src/component/Toast.mjs` were corrected to include the trailing underscore in their `@member` tags, ensuring proper parsing by `neo-jsdoc-x`.

## Files Modified:
* `src/component/Toast.mjs`
* `src/dashboard/Container.mjs`
* `src/grid/Container.mjs`

## Timeline

- 2025-10-02T18:01:16Z @tobiu assigned to @tobiu
- 2025-10-02T18:01:17Z @tobiu added the `bug` label
- 2025-10-02T18:01:17Z @tobiu added the `documentation` label
- 2025-10-02T18:01:45Z @tobiu referenced in commit `5fa3e78` - "Add missing @reactive tags and fix config JSDoc for trailing underscores #7329"
- 2025-10-02T18:01:49Z @tobiu closed this issue

