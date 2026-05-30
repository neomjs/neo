---
id: 3936
title: Neo.applyClassConfig() => adjust the logic for the new config structure => observable mixin
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2023-01-24T07:57:04Z'
updatedAt: '2023-01-24T16:26:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3936'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-24T16:26:06Z'
---
# Neo.applyClassConfig() => adjust the logic for the new config structure => observable mixin

inside the `getConfig-refactoring` branch, the logic is mostly done.

however, right now the `core.Observable` mixin is getting applied to all classes (does not happen in die normal version).

the issue is most likely inside these 100 lines:
https://github.com/neomjs/neo/blob/dev/src/Neo.mjs#L50

## Timeline

- 2023-01-24T07:57:04Z @tobiu added the `enhancement` label
- 2023-01-24T07:57:04Z @tobiu added the `help wanted` label
### @tobiu - 2023-01-24T16:26:05Z

resolved via removing staticConfig completely.

- 2023-01-24T16:26:06Z @tobiu closed this issue

