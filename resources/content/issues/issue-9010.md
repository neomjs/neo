---
id: 9010
title: Implement cellCls config for Grid Columns
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-06T01:18:23Z'
updatedAt: '2026-02-06T01:33:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9010'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T01:33:23Z'
---
# Implement cellCls config for Grid Columns

Currently, `Neo.grid.column.Base` does not support a `cellCls` config. Developers must return an object `{html, cls}` from the `renderer` to apply dynamic classes, which mixes content and styling logic.

To support cleaner code (as seen in `apps/devrank`), implement `cellCls` in `Neo.grid.column.Base` and update `Neo.grid.Row` to apply it.

1.  Add `cellCls` config to `src/grid/column/Base.mjs`.
2.  Update `src/grid/Row.mjs` `applyRendererOutput` to resolve `column.cellCls` (supporting Function, String, or Array) and append to the cell classes.

## Timeline

- 2026-02-06T01:18:24Z @tobiu added the `enhancement` label
- 2026-02-06T01:18:24Z @tobiu added the `ai` label
- 2026-02-06T01:18:25Z @tobiu added the `core` label
- 2026-02-06T01:32:12Z @tobiu assigned to @tobiu
- 2026-02-06T01:32:29Z @tobiu referenced in commit `b0b3305` - "feat(core): Implement cellCls config for Grid Columns (#9010)"
### @tobiu - 2026-02-06T01:32:50Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `cellCls` config in `Neo.grid.column.Base` and `Neo.grid.Row`.
> Refactored `applyRendererOutput` to reuse the config object for both the renderer and `cellCls` function calls, improving maintainability and reducing boilerplate.

- 2026-02-06T01:33:23Z @tobiu closed this issue

