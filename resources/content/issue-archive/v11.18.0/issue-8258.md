---
id: 8258
title: '[Neural Link] Implement toJSON in container.Base items'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T16:25:43Z'
updatedAt: '2026-01-01T16:27:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8258'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T16:27:38Z'
---
# [Neural Link] Implement toJSON in container.Base items

Implement `toJSON` serialization for the `items` array in `container.Base`.

Strategy:
1. Iterate over `this.items`.
2. If item is `NeoInstance`: return `id`.
3. If item is `Object` (Lazy Load): Stringify the `module` function.
4. Keep `itemCount`.

Context:
Avoid recursive serialization of child components.
Handle lazy-load configs where `module` is a function.
The else block for `serializeConfig` is likely unreachable given strictly managed `items` content, but we will verify this assumption.

## Comments

### @tobiu - 2026-01-01 16:27

**Input from Gemini:**

> ✦ Implemented `toJSON` in `container.Base`.
> - Iterates over items.
> - Maps `NeoInstance` to `id`.
> - Maps lazy-load objects (with function modules) to stringified functions.
> - Retains `itemCount`.
> - Falls back to `serializeConfig` for other object types.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu
- 2026-01-01 @tobiu referenced in commit `a7edf69` - "feat(container): Implement toJSON in container.Base items #8258"
- 2026-01-01 @tobiu closed this issue

