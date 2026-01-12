---
id: 7686
title: Enhance `button.Base` handler config for proper reactivity with closures
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-01T10:42:24Z'
updatedAt: '2025-11-01T10:52:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7686'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-01T10:51:58Z'
---
# Enhance `button.Base` handler config for proper reactivity with closures

### Problem
The `handler_` config in `Neo.button.Base` was experiencing a bug where, in recycled components (e.g., in a buffered grid), the handler function would become stale. This was due to the default `Neo.isEqual` (which performs a deep comparison) incorrectly determining that a new handler function (with a new closure) was identical to the old one, preventing the config system from triggering an update.

### Solution
The fix involves adding a descriptor to the `handler_` config in `src/button/Base.mjs`. This descriptor overrides the `isEqual` method to specifically handle function comparisons. If both the old and new handler values are functions, `isEqual` now returns `false`, forcing the config system to always treat a new function instance as a change. For other types (e.g., strings), it defaults to strict equality.

### Rationale for `isEqual` override
Standard JavaScript closure behavior means that two function instances, even with identical source code, can close over different variables. The default deep comparison in `Neo.isEqual` cannot reliably detect this difference. Overriding `isEqual` ensures that new function instances are always considered a change, preventing stale closures in recycled components.

### JSDoc Update
The JSDoc for the `handler_` config in `src/button/Base.mjs` should be updated to explain this behavior and the rationale behind the `isEqual` override.

## Timeline

- 2025-11-01T10:42:25Z @tobiu added the `bug` label
- 2025-11-01T10:42:25Z @tobiu added the `enhancement` label
- 2025-11-01T10:42:25Z @tobiu added the `ai` label
- 2025-11-01T10:51:42Z @tobiu referenced in commit `78c0f33` - "Enhance button.Base handler config for proper reactivity with closures #7686"
- 2025-11-01T10:51:59Z @tobiu closed this issue
- 2025-11-01T10:52:21Z @tobiu assigned to @tobiu

