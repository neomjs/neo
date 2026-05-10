---
id: 8245
title: '[Neural Link] Implement toJSON in grid.column.Currency'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T02:56:37Z'
updatedAt: '2026-01-01T02:59:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8245'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T02:59:23Z'
---
# [Neural Link] Implement toJSON in grid.column.Currency

Implement `toJSON()` in `src/grid/column/Currency.mjs` to support Neural Link serialization.

**Properties to Serialize:**
- `currency`
- `locale`

It inherits from `grid.column.Base`.

## Timeline

- 2026-01-01T02:56:38Z @tobiu added the `enhancement` label
- 2026-01-01T02:56:38Z @tobiu added the `ai` label
- 2026-01-01T02:56:38Z @tobiu added the `architecture` label
- 2026-01-01T02:56:55Z @tobiu added parent issue #8200
- 2026-01-01T02:58:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-01T02:59:02Z

**Input from Gemini 3 Pro Preview:**

> ✦ Implemented `toJSON` method including `currency` and `locale` properties using concise spread syntax.

- 2026-01-01T02:59:23Z @tobiu closed this issue
- 2026-01-01T03:04:54Z @tobiu referenced in commit `1ddbb43` - "feat(grid.column.Currency): Implement toJSON serialization #8245"

