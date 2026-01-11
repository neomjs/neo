---
id: 8091
title: '[Refactor] Update tab.header.Toolbar SortZone logic'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T18:53:16Z'
updatedAt: '2025-12-11T18:55:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8091'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T18:55:39Z'
---
# [Refactor] Update tab.header.Toolbar SortZone logic

Update `src/tab/header/Toolbar.mjs` to use the new `SortZone` creation logic from `container.Base`.
1. Remove `afterSetSortable()`.
2. Implement `loadSortZoneModule()` to import `../../draggable/tab/header/toolbar/SortZone.mjs`.

## Timeline

- 2025-12-11T18:53:18Z @tobiu added the `ai` label
- 2025-12-11T18:53:18Z @tobiu added the `refactoring` label
- 2025-12-11T18:55:15Z @tobiu assigned to @tobiu
- 2025-12-11T18:55:36Z @tobiu referenced in commit `0c8c0c3` - "[Refactor] Update tab.header.Toolbar SortZone logic #8091"
- 2025-12-11T18:55:40Z @tobiu closed this issue

