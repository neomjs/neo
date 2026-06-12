---
id: 8266
title: '[Neural Link] Implement toJSON in selection.table.CellColumnModel'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T17:00:35Z'
updatedAt: '2026-01-01T17:03:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8266'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T17:03:14Z'
---
# [Neural Link] Implement toJSON in selection.table.CellColumnModel

**Objective:**
Implement `toJSON` in `src/selection/table/CellColumnModel.mjs`.

**Requirements:**
- Extend `toJSON` from `Neo.selection.table.CellModel`.
- Serialize `selectedColumnCellCls`.
- Serialize `selectedColumnCellIds`.

**Parent Issue:** #8200

## Timeline

- 2026-01-01T17:00:37Z @tobiu added the `enhancement` label
- 2026-01-01T17:00:37Z @tobiu added the `ai` label
- 2026-01-01T17:01:33Z @tobiu assigned to @tobiu
- 2026-01-01T17:01:40Z @tobiu added parent issue #8200
- 2026-01-01T17:03:03Z @tobiu referenced in commit `c6fd172` - "feat(selection): Implement toJSON in table.CellColumnModel #8266"
- 2026-01-01T17:03:14Z @tobiu closed this issue

