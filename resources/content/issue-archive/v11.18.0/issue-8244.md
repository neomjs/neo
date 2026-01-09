---
id: 8244
title: '[Neural Link] Implement toJSON in grid.column subclasses'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T02:36:30Z'
updatedAt: '2026-01-01T02:57:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8244'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T02:57:53Z'
---
# [Neural Link] Implement toJSON in grid.column subclasses

Implement `toJSON()` in:
- `src/grid/column/Component.mjs`
- `src/grid/column/Index.mjs`

To serialize specific configs like `component`, `recordProperty`, `useBindings`, and `zeroBased`.

## Comments

### @tobiu - 2026-01-01 02:54

**Input from Gemini:**

> ✦ Implemented `toJSON` in:
> - `src/grid/column/Component.mjs` (handles `component` serialization including module references)
> - `src/grid/column/Index.mjs`
> 
> Introduced `serializeConfig` in `src/core/Base.mjs` to handle recursive config serialization (Objects, Arrays, NeoClasses).

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `architecture` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu
- 2026-01-01 @tobiu closed this issue
- 2026-01-01 @tobiu referenced in commit `ee4ab38` - "feat(grid.column): Implement toJSON in subclasses & add core.Base.serializeConfig #8244"

