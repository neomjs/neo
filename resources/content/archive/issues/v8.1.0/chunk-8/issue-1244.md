---
id: 1244
title: 'main.addon.DragDrop: onDragMove() => always fire the event'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-13T09:46:11Z'
updatedAt: '2020-10-14T12:18:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1244'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-14T12:18:04Z'
---
# main.addon.DragDrop: onDragMove() => always fire the event

we should forward drag:move to the app worker, even in case we are using the main thread to handle the dragProxy movement.

this way we can add additional logic (e.g. for sort zones).

## Timeline

- 2020-10-13T09:46:11Z @tobiu added the `enhancement` label
- 2020-10-13T09:46:11Z @tobiu assigned to @tobiu
- 2020-10-13T09:48:44Z @tobiu referenced in commit `b61bf82` - "main.addon.DragDrop: onDragMove() => always fire the event #1244"
### @tobiu - 2020-10-13T10:19:46Z

thinking more about this one, it feels too expensive since drag:move fires very often.

i will add a new config like "alwaysFireDragMove" to make it optional in case moveInMainThread === true.

- 2020-10-13T10:26:37Z @tobiu referenced in commit `b3e2bc3` - "#1244 draggable.DragZone: alwaysFireDragMove config"
- 2020-10-13T10:30:14Z @tobiu referenced in commit `6e711e6` - "#1244 main.addon.DragDrop: alwaysFireDragMove config"
- 2020-10-13T10:35:56Z @tobiu referenced in commit `3ccd6fc` - "#1244 main.addon.DragDrop: fire drag:move optionally"
- 2020-10-14T12:18:05Z @tobiu closed this issue

