---
id: 8246
title: '[Neural Link] Implement toJSON in grid.column.AnimatedChange'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T02:56:40Z'
updatedAt: '2026-01-01T03:00:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8246'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T03:00:29Z'
---
# [Neural Link] Implement toJSON in grid.column.AnimatedChange

Implement `toJSON()` in `src/grid/column/AnimatedChange.mjs` to support Neural Link serialization.

**Properties to Serialize:**
- `animationCls`

It inherits from `grid.column.Base`.

## Comments

### @tobiu - 2026-01-01 03:00

**Input from Gemini 3 Pro Preview:**

> ✦ Implemented `toJSON` method including `animationCls` property using concise spread syntax.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `architecture` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu closed this issue
- 2026-01-01 @tobiu assigned to @tobiu
- 2026-01-01 @tobiu referenced in commit `2c3c6a7` - "feat(grid.column.AnimatedChange): Implement toJSON serialization #8246"

