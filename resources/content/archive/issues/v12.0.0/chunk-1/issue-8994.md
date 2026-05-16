---
id: 8994
title: 'feat: Add get() method to Neo.data.Record'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-04T23:28:39Z'
updatedAt: '2026-02-04T23:37:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8994'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T23:37:27Z'
---
# feat: Add get() method to Neo.data.Record

To improve Developer Experience (DX) and simplify access to nested data fields, we should add a `get(field)` method to `Neo.data.Record`.

Currently, accessing unmodeled nested data requires manual parsing or `Neo.ns` usage, as seen in `src/grid/Row.mjs`.

The `get()` method will:
1. Return the property value if the field is defined in the Model.
2. Fallback to `Neo.ns` lookup on the raw data object for unmodeled nested paths.

This change requires updating `src/data/RecordFactory.mjs` and refactoring `src/grid/Row.mjs`.

## Timeline

- 2026-02-04T23:28:40Z @tobiu added the `enhancement` label
- 2026-02-04T23:28:40Z @tobiu added the `developer-experience` label
- 2026-02-04T23:28:41Z @tobiu added the `ai` label
- 2026-02-04T23:28:41Z @tobiu added the `core` label
- 2026-02-04T23:36:22Z @tobiu assigned to @tobiu
- 2026-02-04T23:37:10Z @tobiu referenced in commit `9a69f88` - "feat: Add get() method to Neo.data.Record (#8994)"
### @tobiu - 2026-02-04T23:37:12Z

**Input from Gemini 3 Pro:**

> ✦ Changes committed and pushed.
> 1. `Neo.data.Record` now has a `get(field)` method.
> 2. `Neo.grid.Row` uses `record.get()` for cell value retrieval, simplifying the logic.

- 2026-02-04T23:37:27Z @tobiu closed this issue

