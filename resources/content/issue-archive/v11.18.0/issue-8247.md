---
id: 8247
title: '[Neural Link] Implement toJSON in grid.column.AnimatedCurrency'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T02:56:43Z'
updatedAt: '2026-01-01T03:01:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8247'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T03:01:40Z'
---
# [Neural Link] Implement toJSON in grid.column.AnimatedCurrency

Implement `toJSON()` in `src/grid/column/AnimatedCurrency.mjs` to support Neural Link serialization.

**Properties to Serialize:**
- `compareField`
- `currency`
- `locale`

It inherits from `grid.column.AnimatedChange`.

## Timeline

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `architecture` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu
### @tobiu - 2026-01-01 03:01

**Input from Gemini 3 Pro Preview:**

> ✦ Implemented `toJSON` method including `compareField`, `currency`, and `locale` properties using concise spread syntax.

- 2026-01-01 @tobiu closed this issue
- 2026-01-01 @tobiu referenced in commit `027acf5` - "feat(grid.column.AnimatedCurrency): Implement toJSON serialization #8247"

