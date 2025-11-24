---
id: 6326
title: >-
  selection.grid.BaseModel: enhance the internal structure for buffered
  rendering
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-28T17:25:53Z'
updatedAt: '2025-03-03T07:30:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6326'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-03T07:30:04Z'
---
# selection.grid.BaseModel: enhance the internal structure for buffered rendering

* Instead of storing the ids of all cells which are affected, we should just store the `dataIndex` of the column
* grid.View should pull this in inside `createRow()` (scrolling)
* The SM needs to tweak the logic a bit 

I will add follow-up tickets for `CellColumnModel`, `CellColumnRowModel`

We could move parts of the new logic into `selection.grid.BaseModel` => follow-up story as well.

## Comments

### @tobiu - 2025-03-03 07:30

the buffered rendering selection models story is resolved.

## Activity Log

- 2025-01-28 @tobiu added the `enhancement` label
- 2025-01-28 @tobiu assigned to @tobiu
- 2025-03-03 @tobiu closed this issue

