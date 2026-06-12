---
id: 5751
title: 'main.addon.MonacoEditor: delay the library loading'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-13T17:56:45Z'
updatedAt: '2024-09-15T19:29:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5751'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T19:29:03Z'
---
# main.addon.MonacoEditor: delay the library loading

related to: https://github.com/neomjs/neo/issues/5750

it should not interfere with the critical rendering path (lighthouse), especially not, when the first route of the app does not even use `LivePreviews`.

## Timeline

- 2024-08-13T17:56:45Z @tobiu added the `enhancement` label
- 2024-08-13T17:56:46Z @tobiu assigned to @tobiu
### @tobiu - 2024-09-15T19:29:04Z

already resolved.

- 2024-09-15T19:29:04Z @tobiu closed this issue

