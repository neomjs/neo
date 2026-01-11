---
id: 8249
title: '[Neural Link] Implement toJSON in grid.Container'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-01T03:16:58Z'
updatedAt: '2026-01-01T03:21:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8249'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T03:21:36Z'
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

## Timeline

- 2026-01-01T03:16:58Z @tobiu added the `enhancement` label
- 2026-01-01T03:16:58Z @tobiu added the `ai` label
- 2026-01-01T03:16:59Z @tobiu added the `architecture` label
- 2026-01-01T03:17:06Z @tobiu added parent issue #8200
- 2026-01-01T03:17:38Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-01T03:21:10Z

**Input from Gemini 3 Pro Preview:**

> ✦ Implemented `toJSON` method for `grid.Container`, serializing `cellEditing`, `columns` (mapped items), `rowHeight`, `scrollbar`, `showHeaderFilters`, `sortable`, and `store`.

- 2026-01-01T03:21:37Z @tobiu closed this issue
- 2026-01-01T03:37:46Z @tobiu referenced in commit `0c91487` - "feat(grid.Container): Implement toJSON serialization #8249"

