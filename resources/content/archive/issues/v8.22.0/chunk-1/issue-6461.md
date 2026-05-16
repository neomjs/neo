---
id: 6461
title: 'grid.View: scrollByRows()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-17T17:14:09Z'
updatedAt: '2025-02-18T15:17:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6461'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-18T15:17:46Z'
---
# grid.View: scrollByRows()

* Related to `selection.grid.RowModel`: We want to be able to navigate into not visible or not mounted areas
* I need to adjust `afterSetScrollPosition()` too, to update the visible range as needed

## Timeline

- 2025-02-17T17:14:09Z @tobiu added the `enhancement` label
- 2025-02-17T17:14:09Z @tobiu assigned to @tobiu
- 2025-02-17T17:14:40Z @tobiu referenced in commit `7a61cbe` - "grid.View: scrollByRows() #6461 WIP"
### @tobiu - 2025-02-17T17:15:54Z

I got pretty close. Still need to handle the edge case when navigating downwards from the last row => selecting & navigating to the first one.

- 2025-02-18T15:14:22Z @tobiu referenced in commit `3e248e0` - "grid.View: scrollByRows() #6461"
- 2025-02-18T15:17:46Z @tobiu closed this issue

