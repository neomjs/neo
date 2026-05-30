---
id: 1383
title: 'draggable.DragZone: fire events on itself when drop related events arrive'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-11-04T11:18:24Z'
updatedAt: '2020-11-04T12:23:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1383'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-04T12:23:18Z'
---
# draggable.DragZone: fire events on itself when drop related events arrive

to make it easier to subscribe to them from the outside

## Timeline

- 2020-11-04T11:18:24Z @tobiu added the `enhancement` label
- 2020-11-04T11:18:24Z @tobiu assigned to @tobiu
### @tobiu - 2020-11-04T11:18:56Z

this also requires to make drag zones observable.

- 2020-11-04T11:22:16Z @tobiu referenced in commit `abf3019` - "draggable.DragZone: fire events on itself when drop related events arrive #1383"
### @tobiu - 2020-11-04T11:30:05Z

changed the logic, so that the dom event manager fires the events on the matching drag zone and this one subscribes to them directly as well.

- 2020-11-04T11:30:37Z @tobiu referenced in commit `2687251` - "#1383 changed the logic, so that the dom event manager fires the events on the matching drag zone and this one subscribes to them directly as well"
### @tobiu - 2020-11-04T11:47:40Z

hmm, i actually like the implementation with 3 listeners less better. it is a tick faster, since you don't need to fetch the handlers from the observable anyway.

- 2020-11-04T11:48:07Z @tobiu referenced in commit `1a2c7f5` - "#1383 back to the implementation with 3 listeners less"
- 2020-11-04T12:23:19Z @tobiu closed this issue

