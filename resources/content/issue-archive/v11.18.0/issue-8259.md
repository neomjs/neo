---
id: 8259
title: '[Neural Link] Implement toJSON in selection.Model'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T16:47:54Z'
updatedAt: '2026-01-01T16:52:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8259'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T16:52:35Z'
---
# [Neural Link] Implement toJSON in selection.Model

**Objective:**
Implement `toJSON` in `src/selection/Model.mjs` to support Neural Link inspection.

**Requirements:**
- Extend the base `toJSON` output.
- Serialize `selectedCls` and `singleSelect`.
- Serialize `items`.
  - Handle potential `Neo.data.Model` records within `items` by calling their `toJSON` method.
  - Handle string-based IDs.

**Parent Issue:** #8200

## Timeline

- 2026-01-01T16:47:54Z @tobiu added the `enhancement` label
- 2026-01-01T16:47:55Z @tobiu added the `ai` label
- 2026-01-01T16:51:51Z @tobiu assigned to @tobiu
- 2026-01-01T16:52:07Z @tobiu added parent issue #8200
- 2026-01-01T16:52:27Z @tobiu referenced in commit `dcc9ff4` - "feat(selection): Implement toJSON in Model #8259"
- 2026-01-01T16:52:35Z @tobiu closed this issue

