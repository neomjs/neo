---
id: 8264
title: '[Neural Link] Implement toJSON in selection.grid.CellColumnModel'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T16:56:29Z'
updatedAt: '2026-01-01T16:58:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8264'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T16:58:36Z'
---
# [Neural Link] Implement toJSON in selection.grid.CellColumnModel

**Objective:**
Implement `toJSON` in `src/selection/grid/CellColumnModel.mjs`.

**Requirements:**
- Extend `toJSON` from `Neo.selection.grid.CellModel` (which inherits from `BaseModel`).
- Serialize `selectedColumnCellCls`.

**Parent Issue:** #8200

## Timeline

- 2026-01-01T16:56:29Z @tobiu added the `enhancement` label
- 2026-01-01T16:56:30Z @tobiu added the `ai` label
- 2026-01-01T16:57:18Z @tobiu assigned to @tobiu
- 2026-01-01T16:57:27Z @tobiu added parent issue #8200
- 2026-01-01T16:58:21Z @tobiu referenced in commit `9dd9e02` - "feat(selection): Implement toJSON in grid.CellColumnModel #8264"
- 2026-01-01T16:58:36Z @tobiu closed this issue

