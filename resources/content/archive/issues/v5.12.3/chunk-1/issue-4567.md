---
id: 4567
title: 'component.Base: updateVdom() => then catch order'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-07-25T17:51:09Z'
updatedAt: '2023-07-25T17:53:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4567'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-25T17:53:24Z'
---
# component.Base: updateVdom() => then catch order

we should trigger `catch()` first, since we are only interested about errors on the vdom worker roundtrip. triggering `then()` first will also catch callback related errors.

## Timeline

- 2023-07-25T17:51:09Z @tobiu added the `enhancement` label
- 2023-07-25T17:51:10Z @tobiu assigned to @tobiu
- 2023-07-25T17:53:07Z @tobiu referenced in commit `393c35d` - "component.Base: updateVdom() => then catch order #4567"
- 2023-07-25T17:53:24Z @tobiu closed this issue

