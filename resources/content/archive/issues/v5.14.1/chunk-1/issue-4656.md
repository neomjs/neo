---
id: 4656
title: 'controller.Application: afterSetMainView() => simplify the Logger registration'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-06T12:47:55Z'
updatedAt: '2023-08-06T12:48:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4656'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-06T12:48:53Z'
---
# controller.Application: afterSetMainView() => simplify the Logger registration

we don't even need to wait for the `mounted` event of the mainView, since the `contextmenu` listener is directly assigned to the `document.body`.

## Timeline

- 2023-08-06T12:47:55Z @tobiu added the `enhancement` label
- 2023-08-06T12:47:56Z @tobiu assigned to @tobiu
- 2023-08-06T12:48:19Z @tobiu referenced in commit `0eaaca0` - "controller.Application: afterSetMainView() => simplify the Logger registration #4656"
- 2023-08-06T12:48:53Z @tobiu closed this issue

