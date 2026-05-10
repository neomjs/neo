---
id: 7974
title: Refactor Loop.mjs configs to be reactive
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-01T17:40:22Z'
updatedAt: '2025-12-01T17:41:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7974'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T17:41:52Z'
---
# Refactor Loop.mjs configs to be reactive

Refactor `assembler` and `provider` configs in `Neo.ai.agent.Loop` to be reactive (`assembler_`, `provider_`).
This allows for dynamic updates and better integration with the `ClassSystemUtil` for flexible instantiation (supporting config objects, classes, or instances).

Also update JSDoc to reflect that `Object` is a valid type for these configs.

## Timeline

- 2025-12-01T17:40:23Z @tobiu added the `ai` label
- 2025-12-01T17:40:24Z @tobiu added the `refactoring` label
- 2025-12-01T17:41:50Z @tobiu assigned to @tobiu
- 2025-12-01T17:41:52Z @tobiu closed this issue
- 2025-12-01T17:44:35Z @tobiu referenced in commit `a4e04c1` - "refactor #7974 Loop configs to be reactive"

