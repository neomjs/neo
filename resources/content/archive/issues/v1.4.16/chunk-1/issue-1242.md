---
id: 1242
title: 'draggable.toolbar.SortZone: apply the client rects for toolbar items onDragStart()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-13T09:16:37Z'
updatedAt: '2020-10-13T09:34:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1242'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-13T09:34:57Z'
---
# draggable.toolbar.SortZone: apply the client rects for toolbar items onDragStart()

plus add `position:'relative'` to the toolbar & `position:'absolute'` to each item

## Timeline

- 2020-10-13T09:16:37Z @tobiu added the `enhancement` label
- 2020-10-13T09:16:37Z @tobiu assigned to @tobiu
- 2020-10-13T09:19:11Z @tobiu referenced in commit `bcf5418` - "#1242 draggable.toolbar.SortZone: added position: relative to the toolbar onDragStart()"
- 2020-10-13T09:34:14Z @tobiu referenced in commit `b556cdc` - "draggable.toolbar.SortZone: apply the client rects for toolbar items onDragStart() #1242"
### @tobiu - 2020-10-13T09:34:57Z

turns out we don't need position: relative on the toolbar. this will just invalidate the positions in case we get the bounding client rects before it got assigned.

- 2020-10-13T09:34:57Z @tobiu closed this issue

