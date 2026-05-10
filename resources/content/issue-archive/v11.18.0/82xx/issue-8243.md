---
id: 8243
title: '[Neural Link] Implement toJSON in grid.column.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T02:30:17Z'
updatedAt: '2026-01-01T02:36:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8243'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T02:36:25Z'
---
# [Neural Link] Implement toJSON in grid.column.Base

Implement `toJSON()` method in `src/grid/column/Base.mjs` to support Neural Link serialization.

**Class:** `Neo.grid.column.Base`
**Extends:** `Neo.core.Base`

**Properties to Serialize:**
- `dataField`
- `type`
- `renderer` (only if value is a string, e.g. "cellRenderer")

**Note:** Inherits `id`, `className`, `ntype`, `isDestroyed`, and `remote` from `core.Base`.

## Timeline

- 2026-01-01T02:30:18Z @tobiu added the `enhancement` label
- 2026-01-01T02:30:19Z @tobiu added the `ai` label
- 2026-01-01T02:30:19Z @tobiu added the `architecture` label
- 2026-01-01T02:30:33Z @tobiu assigned to @tobiu
- 2026-01-01T02:30:37Z @tobiu added parent issue #8200
- 2026-01-01T02:36:20Z @tobiu referenced in commit `21fd50e` - "feat(grid.column.Base): Implement toJSON serialization #8243"
- 2026-01-01T02:36:26Z @tobiu closed this issue

