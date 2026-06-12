---
id: 6373
title: 'draggable.grid.header.toolbar.SortZone: switchItems() => add support for different column widths'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-04T07:51:07Z'
updatedAt: '2025-02-04T09:05:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6373'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-04T09:05:39Z'
---
# draggable.grid.header.toolbar.SortZone: switchItems() => add support for different column widths

If you look close, you can see that moved header positions are already correct:

https://github.com/user-attachments/assets/b333b32e-ab61-4c00-9d59-c740dd470f89

We need to update the widths inside `switchItems()` to get to the same positioning as `draggable.toolbar.SortZone`.

## Timeline

- 2025-02-04T07:51:07Z @tobiu added the `enhancement` label
- 2025-02-04T07:51:07Z @tobiu assigned to @tobiu
- 2025-02-04T09:03:43Z @tobiu referenced in commit `c083186` - "draggable.grid.header.toolbar.SortZone: switchItems() => add support for different column widths #6373"
### @tobiu - 2025-02-04T09:05:39Z

Even easier: we can just re-use the header positions directly.

https://github.com/user-attachments/assets/97d77012-6d69-4a77-90ab-bfc4d2d0206a

- 2025-02-04T09:05:39Z @tobiu closed this issue

