---
id: 6388
title: 'draggable.toolbar.SortZone: reduce the moveFactor when over-dragging'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-06T09:21:27Z'
updatedAt: '2025-02-06T10:07:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6388'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-06T10:07:16Z'
---
# draggable.toolbar.SortZone: reduce the moveFactor when over-dragging

* I noticed this one when testing the new column DD on a phone in portrait mode
* By default, you need to drag more than 50% of a header width to trigger a switch
* However, when dragging out of the grid container, there might not be this much space
* So, when over-dragging, the moveFactor should be way smaller

## Timeline

- 2025-02-06T09:21:27Z @tobiu added the `enhancement` label
- 2025-02-06T09:21:27Z @tobiu assigned to @tobiu
- 2025-02-06T10:00:34Z @tobiu referenced in commit `b1abec6` - "draggable.toolbar.SortZone: reduce the moveFactor when over-dragging #6388"
### @tobiu - 2025-02-06T10:07:16Z

https://github.com/user-attachments/assets/b028b16b-e747-4ed3-b99e-b208bb14ba4b

- 2025-02-06T10:07:16Z @tobiu closed this issue

