---
id: 8093
title: '[Refactor] Unify SortZone creation in Header Toolbars'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T20:01:51Z'
updatedAt: '2025-12-11T20:04:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8093'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T20:04:24Z'
---
# [Refactor] Unify SortZone creation in Header Toolbars

Align `src/grid/header/Toolbar.mjs` and `src/table/header/Toolbar.mjs` with the standard `SortZone` creation pattern (like `dashboard/Container.mjs`).

**Grid Header Toolbar:**
1. Remove `afterSetDragResortable`.
2. Implement `loadSortZoneModule` to import `../../draggable/grid/header/toolbar/SortZone.mjs`.
3. Implement `createSortZone(config)` to inject `boundaryContainerId: [me.id, me.parent.id]` and `scrollLeft: me.scrollLeft`.

**Table Header Toolbar:**
1. Remove `afterSetDragResortable`.
2. Implement `loadSortZoneModule` to import `../../draggable/table/header/toolbar/SortZone.mjs`.
(No custom `createSortZone` needed).

## Timeline

- 2025-12-11T20:01:52Z @tobiu added the `ai` label
- 2025-12-11T20:01:52Z @tobiu added the `refactoring` label
- 2025-12-11T20:02:36Z @tobiu assigned to @tobiu
- 2025-12-11T20:04:15Z @tobiu referenced in commit `574386f` - "[Refactor] Unify SortZone creation in Header Toolbars #8093"
- 2025-12-11T20:04:24Z @tobiu closed this issue

