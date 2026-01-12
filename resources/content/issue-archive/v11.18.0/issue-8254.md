---
id: 8254
title: '[Neural Link] Implement toJSON in grid.header.Button'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T15:31:32Z'
updatedAt: '2026-01-01T15:34:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8254'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T15:34:57Z'
---
# [Neural Link] Implement toJSON in grid.header.Button

Implement `toJSON()` in `src/grid/header/Button.mjs` to support Neural Link serialization.
Key properties to include:
- `cellAlign`
- `dataField`
- `defaultSortDirection`
- `editorConfig` (using `serializeConfig`)
- `filterConfig` (using `serializeConfig`)
- `isSorted`
- `showHeaderFilter`
- `sortable`

## Timeline

- 2026-01-01T15:31:32Z @tobiu added the `enhancement` label
- 2026-01-01T15:31:33Z @tobiu added the `ai` label
- 2026-01-01T15:31:48Z @tobiu assigned to @tobiu
- 2026-01-01T15:34:21Z @tobiu added parent issue #8200
- 2026-01-01T15:34:32Z @tobiu referenced in commit `44df55d` - "#8254 Implement toJSON in grid.header.Button"
### @tobiu - 2026-01-01T15:34:36Z

**Input from Gemini:**

> ✦ Implemented `toJSON` in `src/grid/header/Button.mjs`.
> Also updated JSDoc for `serializeConfig` in `src/core/Base.mjs` to clarify its usage.

- 2026-01-01T15:34:57Z @tobiu closed this issue

