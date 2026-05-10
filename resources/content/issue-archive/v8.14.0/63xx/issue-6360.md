---
id: 6360
title: 'draggable.DragZone: createDragProxy() => convert to async'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-03T12:25:25Z'
updatedAt: '2025-02-03T12:26:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6360'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-03T12:26:07Z'
---
# draggable.DragZone: createDragProxy() => convert to async

* the proxy creation can rely on async tasks, like fetching DOMRects from main
* `dragStart()`needs to become async as well
* `onDragStart()`needs to become async as well

some tweaking needed for class extensions, especially inside the calendar.

## Timeline

- 2025-02-03T12:25:26Z @tobiu added the `enhancement` label
- 2025-02-03T12:25:26Z @tobiu assigned to @tobiu
- 2025-02-03T12:25:58Z @tobiu referenced in commit `6c6f4cd` - "draggable.DragZone: createDragProxy() => convert to async #6360"
- 2025-02-03T12:26:07Z @tobiu closed this issue

