---
id: 6389
title: 'draggable.toolbar.SortZone: onDragMove() => keep scrolling when over-dragging'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-06T09:26:37Z'
updatedAt: '2025-02-06T09:43:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6389'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-06T09:43:40Z'
---
# draggable.toolbar.SortZone: onDragMove() => keep scrolling when over-dragging

* Once we drag out of the boundary container, we scroll one more column into the view
* As long as we keep moving the cursor (or finger), we continue to scroll
* This could even be just moving 1px vertically
* It would be nicer, if the scrolling continues as long as we drag & are outside the zone
* Technically speaking: `onDragMove()` needs to call itself again in this case

## Timeline

- 2025-02-06T09:26:37Z @tobiu added the `enhancement` label
- 2025-02-06T09:26:37Z @tobiu assigned to @tobiu
- 2025-02-06T09:43:34Z @tobiu referenced in commit `6fbc20f` - "draggable.toolbar.SortZone: onDragMove() => keep scrolling when over-dragging #6389"
- 2025-02-06T09:43:40Z @tobiu closed this issue

