---
id: 1075
title: 'draggable.DragZone: destroyDragProxy() => add a delay in case moveInMainThread === false'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-15T10:31:40Z'
updatedAt: '2020-08-15T10:42:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1075'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T10:42:47Z'
---
# draggable.DragZone: destroyDragProxy() => add a delay in case moveInMainThread === false

30ms is probably enough.

there are edge cases where dragMove OPs arrive a bit later than removing the proxyEl from the DOM, resulting in JS errors.

## Timeline

- 2020-08-15T10:31:40Z @tobiu added the `enhancement` label
- 2020-08-15T10:31:40Z @tobiu assigned to @tobiu
- 2020-08-15T10:42:32Z @tobiu referenced in commit `eda773e` - "draggable.DragZone: destroyDragProxy() => add a delay in case moveInMainThread === false #1075"
### @tobiu - 2020-08-15T10:42:46Z

it was a bit more complicated, but it fixed now.

- 2020-08-15T10:42:47Z @tobiu closed this issue

