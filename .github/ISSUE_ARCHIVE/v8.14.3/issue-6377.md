---
id: 6377
title: 'draggable.grid.header.toolbar.SortZone: add support for scrolled columns'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-04T14:32:27Z'
updatedAt: '2025-02-04T15:08:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6377'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-04T15:08:30Z'
---
# draggable.grid.header.toolbar.SortZone: add support for scrolled columns

The current solution does not work yet after scrolling to the right side.

## Comments

### @tobiu - 2025-02-04 15:08

* the new `scrollLeft` config of `draggable.toolbar.SortZone` is now included inside the calculation which triggers the switch
* added a `scrollTop` too, for vertical toolbars
* `grid.Container` now passes `scrollLeft` to `header.Toolbar`
* `header.Toolbar` passes it to its sortZone (static & run-time)

https://github.com/user-attachments/assets/1d4d4db0-ce9a-4f44-92dc-88a78d5660c3

## Activity Log

- 2025-02-04 @tobiu added the `enhancement` label
- 2025-02-04 @tobiu assigned to @tobiu
- 2025-02-04 @tobiu referenced in commit `ff4fbfd` - "draggable.grid.header.toolbar.SortZone: add support for scrolled columns #6377"
- 2025-02-04 @tobiu closed this issue

