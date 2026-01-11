---
id: 7940
title: 'Feat: Add Neo.snakeToCamel utility function'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:19:01Z'
updatedAt: '2025-11-29T23:26:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7940'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T23:26:56Z'
---
# Feat: Add Neo.snakeToCamel utility function

To provide a dedicated and semantically clear utility for converting snake_case strings to camelCase, and to maintain consistency within the core framework''s naming conversion utilities (`Neo.camel`, `Neo.decamel`), a new `snakeToCamel` function will be introduced. This function will reside in `src/core/Util.mjs` and be borrowed into the global `Neo` object for easy access.

### Deliverables
1.  **Implement `snakeToCamel` in `src/core/Util.mjs`:** Create a static utility method `snakeToCamel(value)` that converts a snake_case string to camelCase.
2.  **Borrow into `Neo` object:** Add `Neo.core.Util.snakeToCamel` as `Neo.snakeToCamel` in `src/Neo.mjs`.
3.  **Update `ai/mcp/client/Client.mjs`:** Refactor `Neo.ai.mcp.client.Client` to remove its internal `snakeToCamel` method and use the new `Neo.snakeToCamel` utility.
4.  **Update JSDoc:** Ensure all relevant JSDoc comments are updated to reflect the changes and proper usage.

## Timeline

- 2025-11-29T23:19:01Z @tobiu assigned to @tobiu
- 2025-11-29T23:19:02Z @tobiu added the `enhancement` label
- 2025-11-29T23:19:02Z @tobiu added the `ai` label
- 2025-11-29T23:19:03Z @tobiu added the `refactoring` label
- 2025-11-29T23:19:12Z @tobiu added parent issue #7931
- 2025-11-29T23:26:32Z @tobiu referenced in commit `3af75f7` - "Feat: Add Neo.snakeToCamel utility function #7940"
### @tobiu - 2025-11-29T23:26:35Z

**Input from Gemini 2.5:**

> ✦ I have implemented the `Neo.snakeToCamel` utility function.
> 
> ### Deliverables Completed
> 1.  **Implement `snakeToCamel` in `src/core/Util.mjs`:** A static utility method `snakeToCamel(value)` has been added, converting snake_case strings to camelCase.
> 2.  **Borrow into `Neo` object:** `Neo.core.Util.snakeToCamel` is now aliased as `Neo.snakeToCamel` in `src/Neo.mjs`, making it globally accessible.
> 3.  **Update `ai/mcp/client/Client.mjs`:** The internal `snakeToCamel` method has been removed, and the `Client` now uses the new `Neo.snakeToCamel` utility for dynamic tool proxy creation.
> 4.  **Update JSDoc:** All relevant JSDoc comments have been updated.

- 2025-11-29T23:26:57Z @tobiu closed this issue

