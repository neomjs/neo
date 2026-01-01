---
id: 8249
title: '[Neural Link] Implement toJSON in grid.Container'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-01-01T03:16:58Z'
updatedAt: '2026-01-01T03:16:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8249'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Implement toJSON in grid.Container

Implement `toJSON()` in `src/grid/Container.mjs` to provide a schematic view of the Grid component.

**Properties to Serialize:**
1.  `cellEditing`
2.  `columns`: Map `this.columns.items` to their JSON representation.
3.  `rowHeight`
4.  `scrollbar`: `this.scrollbar?.toJSON()`
5.  `showHeaderFilters`
6.  `sortable`
7.  `store`: `this.store?.toJSON()`

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added the `architecture` label
- 2026-01-01 @tobiu added parent issue #8200

