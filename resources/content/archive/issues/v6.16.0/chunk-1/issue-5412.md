---
id: 5412
title: 'model.Component: resolveStore() => add a check if the store is already bound'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-08T15:19:15Z'
updatedAt: '2024-06-08T15:19:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5412'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-08T15:19:31Z'
---
# model.Component: resolveStore() => add a check if the store is already bound

edge case: moving a table into another browser window and then back into the old window can break, in case there is a top level VM chain => binding will get re-evaluated.

## Timeline

- 2024-06-08T15:19:15Z @tobiu added the `bug` label
- 2024-06-08T15:19:15Z @tobiu assigned to @tobiu
- 2024-06-08T15:19:28Z @tobiu referenced in commit `0e22e24` - "model.Component: resolveStore() => add a check if the store is already bound #5412"
- 2024-06-08T15:19:31Z @tobiu closed this issue
- 2024-06-19T20:46:26Z @tobiu referenced in commit `d7a81bd` - "model.Component: resolveStore() => add a check if the store is already bound #5412"

