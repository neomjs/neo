---
id: 8087
title: '[Refactor] Unify SortZone logic in Container.Base and remove Toolbar specific implementations'
state: CLOSED
labels:
  - epic
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T03:58:40Z'
updatedAt: '2025-12-11T04:05:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8087'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T04:05:36Z'
---
# [Refactor] Unify SortZone logic in Container.Base and remove Toolbar specific implementations

This epic refactoring unifies the draggable sorting logic by promoting it from `Neo.toolbar.Base` to `Neo.container.Base`.

**Key Changes:**
1.  **Neo.container.Base:**
    -   Added `sortable_` (reactive), `sortZone`, and `sortZoneConfig`.
    -   Implemented `loadSortZoneModule()` for lazy loading.
    -   Implemented `createSortZone(config)` to handle instantiation and allow subclasses to inject instance-specific configs.
    -   Implemented `afterSetSortable` to orchestrate lazy loading and creation, using `Neo.merge` for config flexibility.
2.  **Neo.toolbar.Base:**
    -   Removed redundant sortable logic (now inherited).
3.  **Neo.dashboard.Container:**
    -   Removed duplicated logic.
    -   Overrode `loadSortZoneModule` to use `dashboard/SortZone`.
    -   Overrode `createSortZone` to inject instance-specific configs (`dragProxyConfig`, `dragProxyExtraCls`) and listener implementations.
4.  **SortZones:**
    -   Deleted `src/draggable/toolbar/SortZone.mjs` and `DragZone.mjs`.
    -   Subclasses (`Grid`, `Table`, `Tab`) updated to extend `Neo.draggable.container.SortZone` (via `BaseSortZone` alias).
5.  **Subclasses:**
    -   Updated `Neo.grid.Container`, `Neo.table.Container`, `Neo.tab.Container` to use `sortable` (non-reactive) for overrides to avoid conflicts.

**Goal:** Reduce code duplication, improve maintainability, and provide a consistent sorting capability for all Containers.

## Timeline

- 2025-12-11T03:58:41Z @tobiu added the `epic` label
- 2025-12-11T03:58:41Z @tobiu added the `ai` label
- 2025-12-11T03:58:41Z @tobiu added the `refactoring` label
- 2025-12-11T03:59:01Z @tobiu assigned to @tobiu
- 2025-12-11T03:59:39Z @tobiu referenced in commit `60fd9b0` - "[Refactor] Unify SortZone logic in Container.Base and remove Toolbar specific implementations #8087"
- 2025-12-11T04:05:36Z @tobiu closed this issue

