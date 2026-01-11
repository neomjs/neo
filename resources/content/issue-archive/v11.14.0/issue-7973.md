---
id: 7973
title: 'Colors.view.ViewportController: openWidgetInPopup() breaks'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-12-01T17:26:44Z'
updatedAt: '2025-12-01T17:28:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7973'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T17:28:05Z'
---
# Colors.view.ViewportController: openWidgetInPopup() breaks

We recently switched `windowId` from a timestamp to `crypto.randomUUID()`. Calling `parseInt()` on this one can no longer work.

```bash
ViewportController.mjs:360 Uncaught (in promise) TypeError: Cannot destructure property 'basePath' of 'windowConfigs[firstWindowId]' as it is undefined.
    at #openWidgetInPopup (ViewportController.mjs:360:14)
    at ViewportController.onDragBoundaryExit (ViewportController.mjs:283:50)
    at Container.fire (Observable.mjs:255:35)
    at DashboardSortZone.dragBoundaryExit (Container.mjs:52:55)
    at DashboardSortZone.fire (Observable.mjs:255:35)
    at DashboardSortZone.onDragMove (SortZone.mjs:239:28)
    at DomEvent.mjs:146:58
    at Array.every (<anonymous>)
    at DomEvent.fire (DomEvent.mjs:114:31)
    at App.onDomEvent (App.mjs:407:25)
```

## Timeline

- 2025-12-01T17:26:44Z @tobiu assigned to @tobiu
- 2025-12-01T17:26:45Z @tobiu added the `bug` label
- 2025-12-01T17:27:59Z @tobiu referenced in commit `942ea3a` - "Colors.view.ViewportController: openWidgetInPopup() breaks #7973"
- 2025-12-01T17:28:05Z @tobiu closed this issue

