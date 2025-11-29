---
id: 7940
title: 'Feat: Add Neo.snakeToCamel utility function'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:19:01Z'
updatedAt: '2025-11-29T23:19:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7940'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Add Neo.snakeToCamel utility function

To provide a dedicated and semantically clear utility for converting snake_case strings to camelCase, and to maintain consistency within the core framework''s naming conversion utilities (`Neo.camel`, `Neo.decamel`), a new `snakeToCamel` function will be introduced. This function will reside in `src/core/Util.mjs` and be borrowed into the global `Neo` object for easy access.

### Deliverables
1.  **Implement `snakeToCamel` in `src/core/Util.mjs`:** Create a static utility method `snakeToCamel(value)` that converts a snake_case string to camelCase.
2.  **Borrow into `Neo` object:** Add `Neo.core.Util.snakeToCamel` as `Neo.snakeToCamel` in `src/Neo.mjs`.
3.  **Update `ai/mcp/client/Client.mjs`:** Refactor `Neo.ai.mcp.client.Client` to remove its internal `snakeToCamel` method and use the new `Neo.snakeToCamel` utility.
4.  **Update JSDoc:** Ensure all relevant JSDoc comments are updated to reflect the changes and proper usage.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added the `refactoring` label

