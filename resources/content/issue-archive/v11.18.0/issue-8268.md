---
id: 8268
title: '[Neural Link] Implement toJSON in selection.table.CellColumnRowModel'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T17:00:40Z'
updatedAt: '2026-01-01T17:04:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8268'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T17:04:17Z'
---
# [Neural Link] Implement toJSON in selection.table.CellColumnRowModel

**Objective:**
Implement `toJSON` in `src/selection/table/CellColumnRowModel.mjs`.

**Requirements:**
- Extend `toJSON` from `Neo.selection.table.CellRowModel`.
- Serialize `selectedColumnCellCls`.
- Serialize `selectedColumnCellIds`.

**Parent Issue:** #8200

## Timeline

- 2026-01-01T17:00:41Z @tobiu added the `enhancement` label
- 2026-01-01T17:00:41Z @tobiu added the `ai` label
- 2026-01-01T17:03:03Z @tobiu referenced in commit `f3c2e75` - "feat(selection): Implement toJSON in table.CellColumnRowModel #8268"
- 2026-01-01T17:04:02Z @tobiu assigned to @tobiu
- 2026-01-01T17:04:08Z @tobiu added parent issue #8200
- 2026-01-01T17:04:17Z @tobiu closed this issue

