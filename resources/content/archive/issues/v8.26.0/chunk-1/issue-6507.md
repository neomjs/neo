---
id: 6507
title: 'draggable.toolbar.SortZone: onDragMove(), onDragStart() => smarter positioning logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T21:40:32Z'
updatedAt: '2025-02-26T21:42:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6507'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T21:42:54Z'
---
# draggable.toolbar.SortZone: onDragMove(), onDragStart() => smarter positioning logic

* In case a `tab.Container` gets mounted into an absolute positioned parent, it can happen that the `DOMRect`s no longer automatically match the parent positon
* Example: `examples.grid.bigData.ControlsContainer`
* To support such "edge cases", `onDragStart()` should subtract the parent rect x & y values from each item
* `onDragMove()` then needs to honor it inside the delta check (also subtracting the owner rect)

## Timeline

- 2025-02-26T21:40:32Z @tobiu added the `enhancement` label
- 2025-02-26T21:40:32Z @tobiu assigned to @tobiu
- 2025-02-26T21:41:03Z @tobiu referenced in commit `bcd9088` - "draggable.toolbar.SortZone: onDragMove(), onDragStart() => smarter positioning logic #6507"
### @tobiu - 2025-02-26T21:42:54Z

this was non-trivial for sure, but works now:

https://github.com/user-attachments/assets/1bb4eac8-61cc-4504-a366-1adf5b5bb82b

- 2025-02-26T21:42:54Z @tobiu closed this issue

